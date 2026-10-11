const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {verifyBackup} = require('../scripts/verify-backup-artifact.cjs');

function fixture() {
  const root = path.resolve('.routeflow-data/production-backups');
  fs.mkdirSync(root, {recursive: true});
  const folder = fs.mkdtempSync(path.join(root, 'integrity-test-'));
  const files = ['roles.sql', 'schema.sql', 'data.sql'].map(name => {
    const content = Buffer.from(`-- SQL fixture for checksum verification only; not a real backup: ${name}\n`);
    fs.writeFileSync(path.join(folder, name), content);
    return {name, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex')};
  });
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({projectRef: 'production-fixture', files}));
  return folder;
}
test('checksum verification never claims restoration or Storage coverage', () => {
  const report = verifyBackup(fixture(), 'production-fixture');
  assert.equal(report.sqlIntegrityVerified, true);
  assert.equal(report.restorationVerified, false);
  assert.equal(report.storageFilesIncluded, false);
});
test('modified SQL files cannot pass checksum verification', () => {
  const folder = fixture();
  fs.appendFileSync(path.join(folder, 'data.sql'), '-- changed');
  assert.throws(() => verifyBackup(folder, 'production-fixture'), /Integridad inválida/);
});
test('another project and development cannot pass as Production backup', () => {
  const folder = fixture();
  assert.throws(() => verifyBackup(folder, 'different-fixture'), /no corresponde/);
  assert.throws(() => verifyBackup(folder, 'xnnkcgzijlpwxnvarqng'), /no corresponde/);
});
test('missing SQL files cannot pass as complete SQL artifact', () => {
  const folder = fixture();
  const manifestPath = path.join(folder, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.files.pop();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifyBackup(folder, 'production-fixture'), /incompleto/);
});
