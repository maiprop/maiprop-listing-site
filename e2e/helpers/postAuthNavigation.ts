import type { Page } from "@playwright/test";

/**
 * Wait for the login route to finish its post-auth redirect before a test
 * starts another navigation. Firefox aborts an overlapping navigation with
 * NS_BINDING_ABORTED, while Chromium often hides the same race.
 */
export async function waitForPostAuthNavigation(
  page: Page,
  landing: RegExp = /\/dashboard|\/onboarding/,
  timeout = 25_000,
): Promise<void> {
  await page.waitForURL(landing, { timeout });
  await page.locator('input[type="password"]').first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForLoadState("load", { timeout: 15_000 })
    .catch(() => undefined);
}
