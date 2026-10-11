import { FlatCompat } from "@eslint/eslintrc";
import { fixupConfigRules } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep Next's existing lint checks while adapting its glob-based rules to ESLint 9.
const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
  resolvePluginsRelativeTo: path.dirname(fileURLToPath(import.meta.resolve("eslint-config-next"))),
});

export default [
  { ignores: [".next/**", ".next-before-*/**", "node_modules/**", ".routeflow-data/**"] },
  ...fixupConfigRules(compat.extends("next/core-web-vitals", "next/typescript")),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
];
