const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
require("@next/env").loadEnvConfig(process.cwd(), false);
const ref = process.env.ROUTEFLOW_PRODUCTION_PROJECT_REF;
const url = process.env.ROUTEFLOW_PRODUCTION_DATABASE_URL;
if (process.argv.includes('--check')) {
  const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    windowsHide: true, encoding: 'utf8', shell: false, timeout: 15000,
  });
  const prerequisites = [
    {name: 'Proyecto separado de desarrollo', ok: Boolean(ref && ref !== 'xnnkcgzijlpwxnvarqng')},
    {name: 'Conexión Postgres configurada', ok: Boolean(url)},
    {name: 'Docker disponible para pg_dump', ok: docker.status === 0},
  ];
  for (const item of prerequisites) console.log(`${item.ok ? 'OK' : 'PENDIENTE'}: ${item.name}`);
  console.log('No se creó ni restauró un respaldo. Storage necesita copia independiente.');
  process.exit(prerequisites.every(item => item.ok) ? 0 : 2);
}
if (!ref || ref === "xnnkcgzijlpwxnvarqng" || !url)
  throw new Error(
    "Configura un proyecto de producción separado y su conexión Postgres antes del respaldo",
  );
const connection = new URL(url);
if (
  !["postgres:", "postgresql:"].includes(connection.protocol) ||
  !(
    connection.hostname === `db.${ref}.supabase.co` ||
    connection.username.includes(ref)
  )
)
  throw new Error(
    "La conexión no coincide con el proyecto de producción seleccionado",
  );
const directory = path.resolve(
  ".routeflow-data",
  "production-backups",
  `${ref}-${Date.now()}`,
);
const root = path.resolve(".routeflow-data", "production-backups");
if (!directory.startsWith(root + path.sep))
  throw new Error("Ruta de respaldo inválida");
fs.mkdirSync(directory, { recursive: true });
const manifest = {
  projectRef: ref,
  createdAt: new Date().toISOString(),
  files: [],
  storageFilesIncluded: false,
};
for (const [name, flags] of [
  ["roles.sql", ["--role-only"]],
  ["schema.sql", []],
  ["data.sql", ["--data-only", "--use-copy"]],
]) {
  const file = path.join(directory, name);
  // Credentials stay out of output; use the official CLI, requiring Docker's pg_dump runtime.
  const args = [
    "--yes",
    "supabase",
    "db",
    "dump",
    "--db-url",
    url,
    "--file",
    file,
    ...flags,
  ];
  const npxCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js",
  );
  if (!fs.existsSync(npxCli))
    throw new Error(
      "No se encontró la CLI de npm junto al runtime Node; configura el runtime antes del respaldo",
    );
  const result = spawnSync(process.execPath, [npxCli, ...args], {
    windowsHide: true,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0)
    throw new Error(
      `No se completó ${name}. Revisa la conexión y Docker; se conserva el respaldo incompleto. No se aplicaron migraciones.`,
    );
  const contents = fs.readFileSync(file);
  if (contents.length < 50) throw new Error(`Respaldo ${name} vacío`);
  manifest.files.push({
    name,
    bytes: contents.length,
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}
fs.writeFileSync(
  path.join(directory, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  `Respaldo SQL guardado en ${directory}. Falta comprobar la restauración y respaldar los archivos de Storage.`,
);
