// Codacy's ESLint engine does not support ESLint 9 flat config (eslint.config.js).
// This legacy file is used by Codacy's analyzer only; ESLint 9 (used by
// `npm run lint`) ignores .eslintrc.* when eslint.config.js is present.
"use strict";

module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  // No extends — prevents Codacy's bundled legacy React/import plugins from
  // applying outdated rules (react/react-in-jsx-scope, import/no-unresolved, etc.)
  // to this React 18 + ESM codebase. Actual linting is done via GitHub Actions.
  extends: [],
  rules: {
    // ── Disable SolidJS rules ──────────────────────────────────────────────────
    // Codacy bundles eslint-plugin-solid and applies it to JSX/TSX files, but
    // this project uses React 18 (not SolidJS). All solid/* rules are irrelevant.
    "solid/reactivity": "off",
    "solid/event-handlers": "off",
    "solid/no-react-specific-props": "off",
    "solid/prefer-for": "off",
    "solid/no-innerhtml": "off",
    "solid/jsx-no-duplicate-props": "off",
    "solid/components-return-once": "off",
    "solid/no-destructure": "off",
    "solid/no-array-handlers": "off",
    // ── Disable legacy React rules ─────────────────────────────────────────────
    // Codacy may also load eslint-plugin-react with legacy presets. These are
    // irrelevant for React 17+ (which doesn't require React in scope for JSX).
    "react/react-in-jsx-scope": "off",
    "react/button-has-type": "off",
    "react/prop-types": "off",
    // ── Disable import plugin rules ────────────────────────────────────────────
    // import/no-unresolved fires because Codacy resolves paths differently than
    // Vite's bundler (which handles path aliases and node_modules).
    "import/no-unresolved": "off",
  },
  ignorePatterns: ["dist/**", "coverage/**", ".claude/**", "node_modules/**"],
};
