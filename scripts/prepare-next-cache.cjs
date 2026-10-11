// OneDrive placeholders may report as symlinks although readlink returns EINVAL.
// Keep a broken generated cache as a backup instead of deleting project files.
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const cache = path.join(root, '.next');
function hasInvalidLink(directory) {
  if (!fs.existsSync(directory)) return false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    try {
      const info = fs.lstatSync(candidate);
      if (entry.isSymbolicLink() || info.isSymbolicLink()) {
        try { fs.readlinkSync(candidate); }
        catch (error) { if (error.code === 'EINVAL') return true; throw error; }
      } else if (info.isDirectory() && hasInvalidLink(candidate)) return true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return false;
}
// Next dev cleans production artifacts using Dirent links; OneDrive can report
// cloud placeholders as links even when lstat disagrees. Preserve the entire
// production cache before development instead of traversing it during startup.
const developmentAfterBuild = process.argv.includes('--dev') && fs.existsSync(path.join(cache, 'BUILD_ID'));
if (developmentAfterBuild || hasInvalidLink(cache)) {
  const backup = path.join(root, `.next-before-${Date.now()}`);
  if (path.dirname(cache) !== root || path.dirname(backup) !== root) throw Error('Unsafe cache path');
  fs.renameSync(cache, backup);
  console.log('Generated Next.js cache preserved; a new cache will be built.');
}
