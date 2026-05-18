/**
 * Live mock-user action checks.
 *
 * This suite uses the legacy @maiprop.demo mock accounts as real users. It is
 * intentionally live-safe: it may complete onboarding for mock accounts, but it
 * does not submit listings, payments, destructive admin actions, or deletes.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Demo2025!";
const enabled = Boolean(process.env.PLAYWRIGHT_BASE_URL);

type SupportedMockRole = "buyer" | "seller" | "agent" | "developer" | "professional";

const supportedMockUsers: Array<{
  role: SupportedMockRole;
  email: string;
}> = [
  { role: "buyer", email: "buyer3@maiprop.demo" },
  { role: "seller", email: "seller1@maiprop.demo" },
  { role: "agent", email: "agent1@maiprop.demo" },
  { role: "developer", email: "developer1@maiprop.demo" },
  { role: "professional", email: "professional1@maiprop.demo" },
];

const highTrustMockUsers = [
  { email: "investor1@maiprop.demo", label: "investor" },
  { email: "institutional1@maiprop.demo", label: "institutional investor" },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("onboarding_draft");
    window.localStorage.removeItem("listing_draft");
    window.localStorage.setItem(
      "maiprop_cookie_consent",
      JSON.stringify({
        accepted: true,
        functional: true,
        analytics: false,
        mapping: false,
        timestamp: Date.now(),
      }),
    );
    window.sessionStorage.removeItem("role_switch_ctx");
    window.sessionStorage.removeItem("signup_participant_type");
  });
});

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .click();

  const redirected = await page
    .waitForURL(/\/dashboard|\/onboarding/, { timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  const invalid = await page.getByText("Invalid email or password").isVisible().catch(() => false);
  expect(invalid, `${email} should be able to sign in`).toBe(false);
  expect(redirected, `${email} should leave the login page`).toBe(true);
}

async function expectRenderable(page: Page): Promise<void> {
  await expect(page.locator("body")).toContainText(/\S/, { timeout: 15_000 });
  expect(await page.locator("body *").count()).toBeGreaterThan(5);
}

async function routeRenders(page: Page, path: string): Promise<string> {
  await page.goto(path);
  await page.waitForLoadState("load", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const text = document.body.innerText.replace(/\s+/g, " ").trim();
    return text.length > 30 && !/^Loading(\.\.\.|...) ?(AI Assistant)?$/i.test(text);
  }, undefined, { timeout: 20_000 }).catch(() => undefined);
  await expectRenderable(page);
  return (await page.locator("body").innerText({ timeout: 15_000 })).slice(0, 3000);
}

async function dashboardRedirectsToOnboarding(page: Page): Promise<boolean> {
  await page.goto("/dashboard");
  await page.waitForLoadState("load", { timeout: 20_000 });

  await Promise.race([
    page.waitForURL(/\/onboarding/, { timeout: 12_000 }).catch(() => undefined),
    page.locator("body").filter({ hasText: /How are you using maiProp\?|Developer Profile|Business Verification/i }).waitFor({ timeout: 12_000 }).catch(() => undefined),
    page.locator("body").filter({ hasText: /Dashboard|Overview|Settings|My Listings|Messages/i }).waitFor({ timeout: 12_000 }).catch(() => undefined),
  ]);

  const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  return page.url().includes("/onboarding") || /How are you using maiProp\?|Developer Profile|Business Verification/i.test(bodyText);
}

async function maybeCompleteOnboarding(page: Page, role: SupportedMockRole): Promise<void> {
  if (!(await dashboardRedirectsToOnboarding(page))) {
    return;
  }

  await expect(page.locator("body")).toContainText(/How are you using maiProp\?|Developer Profile|Business Verification/i, {
    timeout: 15_000,
  });

  if (role === "buyer" || role === "seller" || role === "agent") {
    const label =
      role === "buyer"
        ? /Home Buyer \/ Renter/
        : role === "seller"
          ? /Private Seller \/ Landlord/
          : /Real Estate Agent \/ Agency/;
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("button", { name: new RegExp(`Continue as .*${role === "buyer" ? "Buyer" : role === "seller" ? "Seller" : "Agent"}`, "i") }).click();
    await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 25_000 }).catch(() => undefined);
    await page.waitForLoadState("load", { timeout: 20_000 });
    return;
  }

  if (role === "developer") {
    await page.getByRole("button", { name: /Developer \/ Builder/ }).click();
    await page.locator('input[placeholder*="Attica"], input[type="text"]').first().fill("Mock Developer One");
    await page.locator('input[placeholder*="Athens"]').fill("Athens");
    await page.getByRole("button", { name: /^Residential/ }).first().click();
    await page.getByRole("button", { name: /Set Up My Account/ }).click();
    await page.waitForURL(/\/pricing|\/dashboard|\/onboarding/, { timeout: 30_000 }).catch(() => undefined);
    await page.waitForLoadState("load", { timeout: 20_000 });
    return;
  }

  await page.getByRole("button", { name: /Service Professional/ }).click();
  await page.getByRole("button", { name: /^Architect$/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator('input[placeholder*="Papadopoulos"], input[type="text"]').first().fill("Mock Architect Studio");
  await page.locator('input[placeholder="123456789"]').fill("123456789");
  await page.locator('input[type="tel"]').fill("+30 6900000000");
  await page.getByRole("button", { name: /Verify & Continue/ }).click();

  await expect(page.locator("body")).toContainText(/Your Services/i, { timeout: 30_000 });
  await page.getByRole("button", { name: /Select All/ }).click();
  await page.getByRole("button", { name: /Save .*Service.*Continue/i }).click();

  await expect(page.locator("body")).toContainText(/Your Availability/i, { timeout: 30_000 });
  await page.getByRole("button", { name: /Save Availability & Continue/ }).click();

  await expect(page.locator("body")).toContainText(/Video Consultations/i, { timeout: 30_000 });
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 30_000 }).catch(() => undefined);
  await page.waitForLoadState("load", { timeout: 20_000 });
}

async function openFirstListingDetail(page: Page): Promise<boolean> {
  await routeRenders(page, "/listings");
  const firstListing = page.locator('a[href*="/property/"], a[href*="/listing/"], [data-testid="property-card"] a').first();
  const visible = await firstListing.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!visible) return false;

  await firstListing.click();
  await page.waitForLoadState("load", { timeout: 20_000 });
  await expectRenderable(page);
  return true;
}

test.describe("legacy mock users required actions on live portal", () => {
  test.skip(!enabled, "Set PLAYWRIGHT_BASE_URL to a live/staging origin to run legacy mock-user actions.");

  for (const mockUser of supportedMockUsers) {
    test(`${mockUser.role} mock user can sign in, finish required setup, and use core modules`, async ({ page }) => {
      test.setTimeout(mockUser.role === "professional" ? 180_000 : 120_000);
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await signIn(page, mockUser.email);
      await maybeCompleteOnboarding(page, mockUser.role);

      const dashboardText = await routeRenders(page, "/dashboard");
      expect(dashboardText, `${mockUser.email} should not remain in onboarding after setup`).not.toMatch(/How are you using maiProp\?/i);
      await routeRenders(page, "/dashboard/settings");
      await routeRenders(page, "/messages");

      if (mockUser.role === "buyer") {
        await openFirstListingDetail(page);
        await routeRenders(page, "/professionals");
        await routeRenders(page, "/auctions");
        await routeRenders(page, "/open-houses");
        await page.goto("/investor-dashboard");
        await page.waitForLoadState("load", { timeout: 20_000 });
        await expect(page.locator("body")).toContainText(/Investor Access Required|Quick Sale|deal flow/i, {
          timeout: 20_000,
        });
        const investorGate = await page.locator("body").innerText({ timeout: 10_000 });
        expect(investorGate).toMatch(/Investor Access Required|Quick Sale|deal flow/i);
      }

      if (mockUser.role === "seller") {
        await routeRenders(page, "/dashboard/listings");
        const newListing = await routeRenders(page, "/listings/new");
        expect(newListing).toMatch(/Create|Listing|Property|Access/i);
      }

      if (mockUser.role === "agent") {
        await routeRenders(page, "/dashboard/listings");
        await routeRenders(page, "/dashboard/data-input");
        const newListing = await routeRenders(page, "/listings/new");
        expect(newListing).toMatch(/Create|Listing|Property|Access/i);
      }

      if (mockUser.role === "developer") {
        const newBuilding = await routeRenders(page, "/listings/new-building");
        expect(newBuilding).toMatch(/Developer Pro Required|New Building|Developer Access/i);
        const projects = await routeRenders(page, "/projects");
        expect(projects).toMatch(/Developer Pro Required|Projects|Developer Access/i);
        await routeRenders(page, "/pricing?audience=developer");
      }

      if (mockUser.role === "professional") {
        await routeRenders(page, "/professionals/me");
        await routeRenders(page, "/dashboard/services");
        await routeRenders(page, "/dashboard/profile");
      }

      expect(pageErrors, `${mockUser.email} uncaught JS errors`).toHaveLength(0);
    });
  }

  for (const mockUser of highTrustMockUsers) {
    test(`${mockUser.email} can sign in and use high-trust investor modules`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await signIn(page, mockUser.email);
      const dashboardText = await routeRenders(page, "/dashboard");
      expect(dashboardText, `${mockUser.email} should use repaired ${mockUser.label} profile state`).not.toMatch(
        /How are you using maiProp\?/i,
      );

      await routeRenders(page, "/messages");
      const investorDashboard = await routeRenders(page, "/investor-dashboard");
      expect(investorDashboard).toMatch(/Investor|Quick Sale|deal flow|portfolio|analytics/i);

      const firesale = await routeRenders(page, "/firesale");
      expect(firesale).toMatch(/Quick Sale|Investor|Investment|Properties|Listings/i);

      const billing = await routeRenders(page, "/dashboard?tab=billing");
      expect(billing).toMatch(/Billing|Plan|Investor|Subscription/i);

      expect(pageErrors, `${mockUser.email} uncaught JS errors`).toHaveLength(0);
    });
  }
});
