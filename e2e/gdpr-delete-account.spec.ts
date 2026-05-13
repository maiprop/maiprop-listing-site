/**
 * GDPR — account deletion E2E.
 *
 * Seeds a throwaway user, signs in, triggers the Delete Account flow from
 * Settings, and verifies:
 *   - The user is signed out and cannot sign back in.
 *   - The auth record no longer exists (verified via service-role).
 *   - Personal data in `profiles` is either gone or anonymised.
 *
 * Skips when SUPABASE_SERVICE_ROLE_KEY is not set (PR forks / open-source CI).
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const canRun =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("abcdefghijklmnop") &&
  ANON_KEY.length > 40 &&
  SERVICE_ROLE.length > 40;

test.describe("GDPR — account deletion", () => {
  test.skip(
    !canRun,
    "Requires VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY",
  );

  test("deleting an account removes the auth user and scrubs profile PII", async ({ page }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket },
    });

    // 1. Create a throwaway user.
    const email = `gdpr-test-${Date.now()}@maiprop.test`;
    const password = "GdprTest2025!";
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createErr, `create user: ${createErr?.message}`).toBeNull();
    const userId = created!.user!.id;

    try {
      await admin.from("profiles").upsert({
        user_id: userId,
        role: "buyer",
        participant_type: "buyer",
        display_name: "GDPR E2E User",
        email,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: "user_id" });

      // Proxy delete-account calls through Node.js to bypass browser CORS when
      // running against localhost:4173 (Vite preview). The edge function's CORS
      // allowlist may not include the CI preview port.
      await page.route("**/functions/v1/delete-account", async (route) => {
        const req = route.request();
        const origin = req.headers()["origin"] ?? "*";
        if (req.method() === "OPTIONS") {
          await route.fulfill({
            status: 200,
            headers: {
              "access-control-allow-origin": origin,
              "access-control-allow-methods": "GET, POST, OPTIONS",
              "access-control-allow-headers":
                "authorization, x-client-info, apikey, content-type",
            },
          });
          return;
        }
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers())) {
          if (!k.startsWith("sec-") && k !== "origin" && k !== "referer") headers[k] = v;
        }
        const res = await fetch(req.url(), {
          method: req.method(),
          headers,
          body: req.postData() ?? undefined,
        });
        const body = await res.text();
        const resHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => { resHeaders[k] = v; });
        resHeaders["access-control-allow-origin"] = origin;
        await route.fulfill({ status: res.status, headers: resHeaders, body });
      });

      // 2. Sign in via UI.
      await page.goto("/login");
      await page.locator('input[type="email"], input[name="email"]').first().fill(email);
      await page.locator('input[type="password"]').first().fill(password);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 20_000 });

      // 3. Navigate to settings and open delete dialog.
      //    Dismiss the cookie-consent banner first — it overlays the bottom of
      //    the page and intercepts pointer events on the Delete Account button.
      await page.evaluate(() =>
        localStorage.setItem(
          "maiprop_cookie_consent",
          JSON.stringify({ accepted: true, functional: true, analytics: true, mapping: true, timestamp: Date.now() }),
        ),
      );
      await page.goto("/dashboard/settings");
      await page.waitForLoadState("networkidle");

      const deleteTrigger = page
        .locator('button:has-text("Delete account"), button:has-text("Delete my account")')
        .first();
      await expect(deleteTrigger).toBeVisible({ timeout: 10_000 });
      await deleteTrigger.click();

      // 4. Confirm in modal.
      const confirmBtn = page
        .locator('button:has-text("Yes, delete my account"), [role="dialog"] button:has-text("Delete")')
        .first();
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await confirmBtn.click();

      // 5. Expect redirect to root / login and loss of session.
      await page.waitForURL(/\/(login)?$/, { timeout: 20_000 });

      // 6. Attempt sign-in again — should fail.
      await page.goto("/login");
      await page.locator('input[type="email"], input[name="email"]').first().fill(email);
      await page.locator('input[type="password"]').first().fill(password);
      await page.locator('button[type="submit"]').first().click();
      // Either an error toast or we stay on /login.
      await page.waitForTimeout(3000);
      expect(page.url()).toMatch(/\/login/);

      // 7. Verify via service role that the auth user is gone.
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const stillExists = users.some((u) => u.id === userId);
      expect(stillExists, "auth user should be deleted").toBe(false);

      // 8. Verify profile row is either deleted or has no PII left.
      const { data: profile } = await admin
        .from("profiles")
        .select("user_id, first_name, last_name, email, display_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (profile) {
        const pii = [profile.first_name, profile.last_name, profile.email, profile.display_name]
          .filter(Boolean)
          .join("|")
          .toLowerCase();
        expect(pii, "profile PII should be scrubbed").not.toContain(email.toLowerCase());
      }
    } finally {
      // Best-effort cleanup in case the test fails mid-way.
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });
});
