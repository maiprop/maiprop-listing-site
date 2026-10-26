import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      ".worktrees/**",
      ".tmp/**",
      ".superpowers/**",
      "supabase/functions/coverage/**",
      ".codex-remote-attachments/**",
      ".claude/**",
      "mai-pro-os/**",
      "src/components/ui/**",
      "scripts/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      // Local lint never enforced cyclomatic complexity; keep DeepSource from
      // turning existing route/controller complexity into a blocking PR gate.
      complexity: "off",
    },
  },
  {
    // Test files: allow @ts-nocheck on render-smoke harnesses where strict
    // prop typing would require building exhaustive fixtures for every
    // component. Production code still bans the directive.
    files: ["src/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-nocheck": false }],
    },
  },
);
