const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");

function inside(base, candidate) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function planCache(root, name, platform = process.platform, localRoot = os.tmpdir()) {
  if (![".next", ".next-dev"].includes(name)) throw new Error("Unexpected generated directory");
  if (platform !== "win32" || !/[\\/]OneDrive(?:[\\/]| -)/i.test(root)) return null;
  const key = createHash("sha256")
    .update(path.resolve(root).toLowerCase())
    .digest("hex")
    .slice(0, 24);
  const parent = path.join(localRoot, "routeflow-generated", key);
  return { parent, target: path.join(parent, name.slice(1)), link: path.join(root, name) };
}
function linkTarget(link) {
  try {
    return path.resolve(path.dirname(link), fs.readlinkSync(link));
  } catch (error) {
    if (["ENOENT", "EINVAL", "UNKNOWN"].includes(error.code)) return null;
    throw error;
  }
}
function ensureLocalCache(root, name, reset = false, options = {}) {
  const plan = planCache(root, name, options.platform, options.localRoot);
  if (!plan) return false;
  const { parent, target, link } = plan;
  if (!inside(root, link) || !inside(parent, target)) throw new Error("Unsafe generated directory");
  const linked = linkTarget(link);
  if (linked && linked.toLowerCase() !== path.resolve(target).toLowerCase())
    throw new Error("Generated cache points to another location; inspect it before replacing it");
  if (!linked && fs.existsSync(link)) {
    const backup = path.join(root, `${name}-before-${Date.now()}`);
    if (!inside(root, backup)) throw new Error("Unsafe backup path");
    fs.renameSync(link, backup);
  }
  if (reset && fs.existsSync(target)) {
    const backup = `${target}-before-${Date.now()}`;
    if (!inside(parent, backup)) throw new Error("Unsafe local cache backup");
    fs.renameSync(target, backup);
  }
  fs.mkdirSync(target, { recursive: true });
  // Modules externalized by Next still resolve the project's dependencies
  // after Node follows the output junction to its physical location.
  const modules = path.join(parent, "node_modules");
  const projectModules = path.join(root, "node_modules");
  if (fs.existsSync(projectModules)) {
    const current = linkTarget(modules);
    if (current && current.toLowerCase() !== projectModules.toLowerCase())
      throw new Error("Unexpected dependency junction");
    if (!current) {
      if (fs.existsSync(modules)) throw new Error("Unexpected dependency directory");
      fs.symlinkSync(projectModules, modules, "junction");
    }
  }
  if (!linked) fs.symlinkSync(target, link, "junction");
  console.log(`Generated ${name} files use a local cache outside OneDrive.`);
  return true;
}
module.exports = { planCache, ensureLocalCache, inside };
