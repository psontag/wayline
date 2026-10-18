import js from "@eslint/js";
import i18next from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// domain and planner run in the browser, in a Web Worker and in a Cloudflare
// Worker. They must not depend on any of them.
const portableImports = [
  {
    group: ["react", "react-*", "react/*", "@tanstack/*"],
    message: "domain and planner must not depend on React.",
  },
  {
    group: ["hono", "hono/*", "cloudflare:*", "@cloudflare/*", "wrangler"],
    message: "domain and planner must not depend on Cloudflare or Hono.",
  },
  {
    group: ["@wayline/web", "@wayline/api", "@wayline/ui", "**/apps/**"],
    message: "domain and planner must not depend on apps or UI code.",
  },
];

const browserGlobals = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "self",
  "fetch",
].map((name) => ({
  name,
  message: "domain and planner must not use browser or Worker globals.",
}));

export default defineConfig(
  globalIgnores(["**/dist/", "**/.wrangler/", "**/node_modules/"]),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    extends: [i18next.configs["flat/recommended"]],
    rules: {
      "i18next/no-literal-string": ["error", { mode: "jsx-only" }],
    },
  },
  {
    files: ["packages/domain/**/*.ts", "packages/planner/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: portableImports }],
      "no-restricted-globals": ["error", ...browserGlobals],
    },
  },
);
