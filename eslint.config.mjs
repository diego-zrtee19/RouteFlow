import "./scripts/minimatch-compat.cjs";
import { createRequire } from "node:module";
import { fixupPluginRules } from "@eslint/compat";
const require = createRequire(import.meta.url);
const react = require("eslint-plugin-react");
const hooks = require("eslint-plugin-react-hooks");
const a11y = require("eslint-plugin-jsx-a11y");
const imports = require("eslint-plugin-import");
const next = require("@next/eslint-plugin-next");
const typescript = require("@typescript-eslint/eslint-plugin");
const parser = require("@typescript-eslint/parser");
const globals = require("globals");

// Native flat configuration preserves Next's React/hooks/a11y and TypeScript
// checks without FlatCompat's legacy dependency tree or module-resolution patch.
export default [
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      ".next-before-*/**",
      ".next-dev-before-*/**",
      "node_modules/**",
      ".routeflow-data/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    languageOptions: {
      parser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      react: fixupPluginRules(react),
      "react-hooks": fixupPluginRules(hooks),
      "jsx-a11y": fixupPluginRules(a11y),
      import: fixupPluginRules(imports),
      "@next/next": fixupPluginRules(next),
      "@typescript-eslint": typescript,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      "import/no-anonymous-default-export": "warn",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      ...typescript.configs["eslint-recommended"].overrides[0].rules,
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];
