// Legacy React/a11y lint rules expect require("minimatch") to be callable.
// Keep the patched modern implementation; adapt ONLY that CommonJS shape.
// Modern named exports and the Minimatch constructor remain unchanged.
const resolved = require.resolve("minimatch");
const modern = require(resolved);
if (typeof modern !== "function") {
  const callable = Object.assign((...args) => modern.minimatch(...args), modern);
  require.cache[resolved].exports = callable;
}
