import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_add_message_delivery_identity\.sql$/.test(name)
);
const migration = migrationName
  ? readFileSync(resolve(migrations, migrationName), "utf8")
  : "";
const grantMigrationName = readdirSync(migrations).find((name) =>
  /^\d{14}_grant_message_delivery_identity_insert\.sql$/.test(name)
);
const grantMigration = grantMigrationName
  ? readFileSync(resolve(migrations, grantMigrationName), "utf8")
  : "";

describe("message delivery identity migration", () => {
  it("adds a sender-scoped idempotency key for optimistic reconciliation", () => {
    expect(migrationName).toBeTruthy();
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS client_delivery_id uuid",
    );
    expect(migration).toContain("(sender_id, client_delivery_id)");
    expect(migration).toContain("WHERE client_delivery_id IS NOT NULL");
  });

  it("extends the existing least-privilege insert grant only to the delivery key", () => {
    expect(grantMigrationName).toBeTruthy();
    expect(grantMigration).toContain(
      "GRANT INSERT (client_delivery_id) ON public.messages TO authenticated",
    );
    expect(grantMigration).not.toContain("GRANT INSERT ON public.messages");
  });
});
