const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/** Read-only handoff checks. Never reads credentials or contacts a provider. */
function checkRepository(root = process.cwd()) {
  const errors = [];
  const documents = [
    "README.md",
    "CONTRIBUTING.md",
    "docs/README.md",
    "docs/operations/supabase-setup.md",
    "scripts/README.md",
    "supabase/schemas/README.md",
    ...fs
      .readdirSync(path.join(root, "docs/development"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => `docs/development/${name}`),
  ];
  for (const name of documents) {
    const filename = path.join(root, name);
    const text = fs.readFileSync(filename, "utf8");
    for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(filename), decodeURIComponent(target)))) {
        errors.push(`${name}: missing documentation target ${target}`);
      }
    }
  }
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const name of tracked) {
    const basename = path.posix.basename(name);
    if (
      (/^\.env(?:\.|$)/.test(basename) && !basename.endsWith(".example")) ||
      /^(?:\.routeflow-data|\.next[^/]*|node_modules|\.tmp-stripe-cli)\//.test(name) ||
      /\.(?:pem|key)$/i.test(name)
    ) {
      errors.push(`Private or generated path is tracked: ${name}`);
    }
  }
  if (fs.readdirSync(root).some((name) => /^supabase.*\.sql$/.test(name))) {
    errors.push("Keep preserved SQL in supabase/schemas, not in the project root");
  }
  return { documents: documents.length, trackedPaths: tracked.length, errors };
}

if (require.main === module) {
  try {
    const result = checkRepository();
    if (result.errors.length) {
      result.errors.forEach((error) => console.error(error));
      process.exitCode = 1;
    } else {
      console.log(
        `Repository checks passed: ${result.documents} documents and ${result.trackedPaths} tracked paths. This checks paths, not secret contents or remote services.`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { checkRepository };
