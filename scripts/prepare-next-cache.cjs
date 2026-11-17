// OneDrive placeholders may report as symlinks although readlink returns EINVAL.
// Keep a broken generated cache as a backup instead of deleting project files.
const fs = require("node:fs");
const path = require("node:path");
const root = fs.realpathSync(process.cwd());
const cacheName = process.argv.includes("--dev") ? ".next-dev" : ".next";
const cache = path.join(root, cacheName);
const { ensureLocalCache } = require("./local-next-cache.cjs");
if (ensureLocalCache(root, cacheName, process.argv.includes("--reset"))) process.exit(0);
function hasInvalidLink(directory) {
  if (!fs.existsSync(directory)) return false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    try {
      const info = fs.lstatSync(candidate);
      if (entry.isSymbolicLink() || info.isSymbolicLink()) {
        try {
          fs.readlinkSync(candidate);
        } catch (error) {
          if (error.code === "EINVAL") return true;
          throw error;
        }
      } else if (info.isDirectory() && hasInvalidLink(candidate)) return true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return false;
}
// Preserve invalid generated artifacts within the selected cache only.
if ((process.argv.includes("--reset") && fs.existsSync(cache)) || hasInvalidLink(cache)) {
  const backup = path.join(root, `${cacheName}-before-${Date.now()}`);
  if (path.dirname(cache) !== root || path.dirname(backup) !== root)
    throw Error("Unsafe cache path");
  fs.renameSync(cache, backup);
  console.log("Generated Next.js cache preserved; a new cache will be built.");
}
