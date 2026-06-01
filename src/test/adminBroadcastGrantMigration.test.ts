import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serviceRpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601145500_add_service_admin_broadcast_rpc.sql"),
  "utf8",
);

const legacyRevokeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601145512_restrict_legacy_admin_broadcast_rpc.sql"),
  "utf8",
);

const adminBroadcast = readFileSync(
  resolve(process.cwd(), "src/components/AdminBroadcastNotifications.tsx"),
  "utf8",
);

const edgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/admin-broadcast-notification/index.ts"),
  "utf8",
);

const futureAdvisorHardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260707140000_harden_supabase_advisor_security.sql"),
  "utf8",
);

describe("admin broadcast RPC grants", () => {
  it("adds a service-role-only explicit-admin broadcast RPC", () => {
    expect(serviceRpcMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_broadcast_notification_for_user",
    );
    expect(serviceRpcMigration).toContain("NOT public.has_platform_admin(v_actor)");
    expect(serviceRpcMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(serviceRpcMigration).toContain("TO service_role");
    expect(serviceRpcMigration).toContain("admin_broadcast_notification_for_user must not be browser-callable");
  });

  it("removes browser-role execution from the legacy broadcast RPC", () => {
    expect(legacyRevokeMigration).toContain(
      "public.admin_broadcast_notification(text,text,text,text,text)",
    );
    expect(legacyRevokeMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(legacyRevokeMigration).toContain("legacy admin broadcast RPC must not remain browser-callable");
  });

  it("routes Admin Broadcasts through the protected Edge Function", () => {
    expect(adminBroadcast).toContain('"admin-broadcast-notification"');
    expect(adminBroadcast).not.toContain('rpc("admin_broadcast_notification"');
    expect(edgeFunction).toContain("verifyBearerToken");
    expect(edgeFunction).toContain('"admin_broadcast_notification_for_user"');
  });

  it("keeps the future advisor-hardening migration aligned for fresh database builds", () => {
    const internalGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 2. Trigger/cron/internal"),
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
    );
    const appFacingGrantBlock = futureAdvisorHardeningMigration.slice(
      futureAdvisorHardeningMigration.indexOf("-- 3. App-facing SECURITY DEFINER RPCs"),
      futureAdvisorHardeningMigration.indexOf("-- 4. Public buckets"),
    );

    expect(internalGrantBlock).toContain("public.admin_broadcast_notification(text,text,text,text,text)");
    expect(internalGrantBlock).toContain("public.admin_broadcast_notification_for_user(uuid,text,text,text,text,text)");
    expect(appFacingGrantBlock).not.toContain("public.admin_broadcast_notification");
  });
});
