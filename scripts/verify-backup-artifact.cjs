const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

function verifyBackup(directory, expectedRef) {
  const root = fs.realpathSync(path.resolve('.routeflow-data/production-backups'));
  const folder = fs.realpathSync(directory);
  if (!folder.startsWith(root + path.sep)) throw Error('El respaldo debe estar dentro de production-backups');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  if (!expectedRef || expectedRef === 'xnnkcgzijlpwxnvarqng' || manifest.projectRef !== expectedRef)
    throw Error('El respaldo no corresponde al proyecto Production');
  const required = ['roles.sql', 'schema.sql', 'data.sql'];
  if (!Array.isArray(manifest.files) || manifest.files.length !== required.length)
    throw Error('Respaldo SQL incompleto');
  for (const name of required) {
    const matches = manifest.files.filter(file => file.name === name);
    if (matches.length !== 1) throw Error('Falta un archivo SQL esperado');
    const file = matches[0];
    const filename = fs.realpathSync(path.join(folder, name));
    if (path.dirname(filename) !== folder) throw Error('Archivo fuera de la carpeta de respaldo');
    const contents = fs.readFileSync(filename);
    if (contents.length < 50 || contents.length !== file.bytes ||
      createHash('sha256').update(contents).digest('hex') !== file.sha256)
      throw Error(`Integridad inválida: ${name}`);
  }
  return {projectRef: expectedRef, checkedAt: new Date().toISOString(), sqlIntegrityVerified: true,
    storageFilesIncluded: manifest.storageFilesIncluded === true, restorationVerified: false};
}
module.exports = {verifyBackup};
if (require.main === module) {
  require('@next/env').loadEnvConfig(process.cwd(), false);
  try {
    if (!process.argv[2]) throw Error('Indica la carpeta de un respaldo SQL existente');
    const report = verifyBackup(process.argv[2], process.env.ROUTEFLOW_PRODUCTION_PROJECT_REF);
    fs.writeFileSync('.routeflow-data/backup-integrity-verification.json', JSON.stringify(report, null, 2));
    console.log('OK: integridad y proyecto de los tres archivos SQL verificados.');
    console.log('PENDIENTE: ensayo de restauración en una base aislada. La integridad no demuestra restauración.');
    if (!report.storageFilesIncluded) console.log('PENDIENTE: respaldo independiente de Storage.');
  } catch (error) {console.error(error.message); process.exitCode = 2;}
}
