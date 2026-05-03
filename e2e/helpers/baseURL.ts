import { test } from "@playwright/test";

/**
 * `browser.newContext()` does NOT inherit `use.baseURL` from playwright.config.ts —
 * fixtures populate it on `page`, but raw contexts start with no baseURL. Read it
 * at runtime from the active project's config so this stays in sync if the config
 * changes (CI vs local, vs preview deploys).
 */
export function getBaseURL(): string {
  return test.info().project.use.baseURL ?? "http://localhost:8080";
}
