import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
} from "../../scripts/staging-load-dataset.mjs";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const STAGING_MUTATION_ACKNOWLEDGEMENT =
  `MUTATE_STAGING_${STAGING_PROJECT_REF}`;

function remoteDatabaseProjectRef(database) {
  const username = decodeURIComponent(database.username);
  const hostname = database.hostname.toLowerCase();
  const directMatch = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(hostname);
  const poolerHost = /^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(hostname);

  if (directMatch) {
    if (username !== "postgres") {
      throw new Error("Direct staging database URL must use the postgres user.");
    }
    return directMatch[1];
  }
  if (poolerHost) {
    const poolerUser = /^postgres\.([a-z0-9]{20})$/.exec(username);
    if (!poolerUser) {
      throw new Error(
        "Staging pooler URL must use the postgres.<project-ref> user.",
      );
    }
    return poolerUser[1];
  }
  throw new Error(
    "Staging database URL must use a Supabase direct or pooler hostname.",
  );
}

export function assertPromotionEntitlementTarget({
  databaseUrl,
  target,
  acknowledgement,
}) {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Promotion test database URL must use PostgreSQL.");
  }

  if (LOCAL_HOSTS.has(parsed.hostname)) {
    if (target && target !== "local") {
      throw new Error("Local promotion proof must use target=local.");
    }
    if (parsed.pathname !== "/postgres") {
      throw new Error("Local promotion proof must target the postgres database.");
    }
    return {
      target: "local",
      projectRef: "local",
      isLocal: true,
    };
  }

  if (target !== "staging") {
    throw new Error(
      "Remote promotion entitlement proof is restricted to staging.",
    );
  }

  if (parsed.pathname !== "/postgres") {
    throw new Error("Staging database URL must target the postgres database.");
  }
  if (parsed.port && !["5432", "6543"].includes(parsed.port)) {
    throw new Error("Staging database URL uses an unsupported port.");
  }
  if (parsed.searchParams.get("sslmode") !== "require") {
    throw new Error(
      "Staging database URL must require TLS with sslmode=require.",
    );
  }
  if (acknowledgement !== STAGING_MUTATION_ACKNOWLEDGEMENT) {
    throw new Error(
      `Staging mutation acknowledgement must be ${STAGING_MUTATION_ACKNOWLEDGEMENT}.`,
    );
  }

  const projectRef = remoteDatabaseProjectRef(parsed);
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing to mutate the MaiProp production Supabase project.");
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(
      `Database target ${projectRef} does not match staging ${STAGING_PROJECT_REF}.`,
    );
  }
  return {
    target: "staging",
    projectRef: STAGING_PROJECT_REF,
    isLocal: false,
  };
}

const PRIVILEGE_PROBE_SQL = `
  SELECT CASE
    WHEN current_database() = 'postgres'
      AND current_user = 'postgres'
      AND has_table_privilege(current_user, 'auth.users', 'INSERT,DELETE')
      AND has_table_privilege(current_user, 'public.profiles', 'INSERT,DELETE')
      AND has_table_privilege(
        current_user,
        'public.billing_subscriptions',
        'INSERT,DELETE'
      )
      AND has_table_privilege(current_user, 'public.listings', 'INSERT,DELETE')
      AND has_table_privilege(
        current_user,
        'public.listing_promotion_allocations',
        'DELETE'
      )
    THEN 'authorized'
    ELSE 'insufficient'
  END;
`;

export async function provePromotionMutationPrivilege(runReadOnlyProbe) {
  const result = await runReadOnlyProbe(
    PRIVILEGE_PROBE_SQL,
    "promotion-concurrency-privilege-check",
  );
  if (result.code !== 0 || result.stdout !== "authorized") {
    throw new Error(
      `Database caller lacks required fixture mutation privileges: ${
        result.stderr || result.stdout || "privilege probe failed"
      }`,
    );
  }
}
