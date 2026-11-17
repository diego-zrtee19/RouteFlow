const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("development and production use distinct Next output directories", async () => {
  const { default: config } = await import("../next.config.mjs");
  assert.equal(config("phase-development-server").distDir, ".next-dev");
  assert.equal(config("phase-production-build").distDir, ".next");
  assert.equal(config("phase-production-server").distDir, ".next");
});

test("development reuses memory without filesystem cache packs", async () => {
  const { default: config } = await import("../next.config.mjs");
  const generated = config("phase-development-server").webpack({ cache: false }, { dev: true });
  assert.deepEqual(generated.cache, { type: "memory" });
});

test("explicit recovery preserves the dev cache without altering production or source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routeflow-cache-reset-"));
  fs.mkdirSync(path.join(root, ".next-dev"));
  fs.writeFileSync(path.join(root, ".next-dev", "old-chunk.js"), "old development artifact");
  fs.mkdirSync(path.join(root, ".next"));
  fs.writeFileSync(path.join(root, ".next", "BUILD_ID"), "production-build");
  fs.writeFileSync(path.join(root, "source.ts"), "source remains unchanged");
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../scripts/prepare-next-cache.cjs"), "--dev", "--reset"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, ".next-dev")), false);
  const backups = fs.readdirSync(root).filter((name) => name.startsWith(".next-dev-before-"));
  assert.equal(backups.length, 1);
  assert.equal(
    fs.readFileSync(path.join(root, backups[0], "old-chunk.js"), "utf8"),
    "old development artifact",
  );
  assert.equal(fs.readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8"), "production-build");
  assert.equal(fs.readFileSync(path.join(root, "source.ts"), "utf8"), "source remains unchanged");
});

test("predev leaves an existing production build intact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "routeflow-cache-"));
  // Temporary fixtures are retained; no recursive deletion of computed paths.
  fs.mkdirSync(path.join(root, ".next"));
  fs.writeFileSync(path.join(root, ".next", "BUILD_ID"), "production-build");
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../scripts/prepare-next-cache.cjs"), "--dev"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8"), "production-build");
  assert.deepEqual(fs.readdirSync(root), [".next"]);
});

const { ensureLocalCache, planCache } = require("../scripts/local-next-cache.cjs");
test("OneDrive generated files live outside the synced source", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "routeflow-junction-test-"));
  const root = path.join(base, "OneDrive", "project"),
    localRoot = path.join(base, "cache");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.mkdirSync(path.join(root, ".next-dev"));
  fs.writeFileSync(path.join(root, ".next-dev", "old.js"), "preserve");
  fs.writeFileSync(path.join(root, "source.ts"), "original");
  assert.equal(ensureLocalCache(root, ".next-dev", false, { platform: "win32", localRoot }), true);
  const plan = planCache(root, ".next-dev", "win32", localRoot);
  assert.equal(fs.realpathSync(plan.link), fs.realpathSync(plan.target));
  assert.equal(
    fs.readFileSync(
      path.join(
        root,
        fs.readdirSync(root).find((n) => n.startsWith(".next-dev-before-")),
        "old.js",
      ),
      "utf8",
    ),
    "preserve",
  );
  fs.writeFileSync(path.join(plan.target, "chunk.js"), "cache");
  ensureLocalCache(root, ".next-dev", true, { platform: "win32", localRoot });
  assert.equal(fs.existsSync(path.join(plan.target, "chunk.js")), false);
  assert.equal(fs.readFileSync(path.join(root, "source.ts"), "utf8"), "original");
  assert.equal(
    fs.realpathSync(path.join(plan.parent, "node_modules")),
    fs.realpathSync(path.join(root, "node_modules")),
  );
});
test("cache refuses foreign junctions and invalid paths", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "routeflow-junction-guard-"));
  const root = path.join(base, "OneDrive", "project"),
    foreign = path.join(base, "foreign");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(foreign);
  fs.symlinkSync(foreign, path.join(root, ".next"), "junction");
  assert.throws(
    () => ensureLocalCache(root, ".next", false, { platform: "win32", localRoot: base }),
    /another location/,
  );
  assert.throws(() => planCache(root, "../source", "win32", base), /Unexpected/);
  assert.equal(planCache(root, ".next", "linux", base), null);
});
test("patched minimatch retains legacy call and modern constructor APIs", () => {
  require("../scripts/minimatch-compat.cjs");
  const mm = require("minimatch");
  assert.equal(mm("src/a.ts", "**/*.ts"), true);
  assert.equal(new mm.Minimatch("**/*.ts").match("src/a.ts"), true);
});
test("lint still detects React, hooks, accessibility and TypeScript defects", async () => {
  const { ESLint } = require("eslint");
  const eslint = new ESLint({ cwd: path.resolve(__dirname, "..") });
  const [result] = await eslint.lintText(
    'import {useState} from "react"; export default function Bad({ok}: {ok:boolean}) { const unused=1; if(ok) useState(0); return <div aria-invalid-property="x">{[1,2].map(v=><span>{v}</span>)}</div> }',
    { filePath: "src/lint-regression.tsx" },
  );
  const rules = result.messages.map((m) => m.ruleId);
  for (const rule of [
    "react-hooks/rules-of-hooks",
    "react/jsx-key",
    "jsx-a11y/aria-props",
    "@typescript-eslint/no-unused-vars",
  ])
    assert.ok(rules.includes(rule), rule);
});
