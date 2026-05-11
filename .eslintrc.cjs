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
  rules: {},
  ignorePatterns: ["dist/**", "coverage/**", ".claude/**", "node_modules/**"],
};
