const PROJECT_REF = /^[a-z0-9]{20}$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function requiredProjectRef(value, label) {
  const ref = String(value ?? "").trim();
  if (!PROJECT_REF.test(ref)) {
    throw new Error(`${label} must be a 20-character Supabase project ref.`);
  }
  return ref;
}

function apiProjectRef(url) {
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  return match?.[1] ?? "";
}

function databaseProjectRef(url) {
  const username = decodeURIComponent(url.username);
  if (username.startsWith("postgres.")) {
    const ref = username.slice("postgres.".length);
    return PROJECT_REF.test(ref) ? ref : "";
  }
  const directMatch = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  return directMatch?.[1] ?? "";
}

export function assertCompleteTapOutput(output) {
  const tap = String(output ?? "");
  if (/^\s*Bail out!/im.test(tap)) {
    throw new Error("TAP output contains Bail out!.");
  }
  if (/^\s*not ok\b/im.test(tap)) {
    throw new Error("TAP output contains a not ok result.");
  }

  const plans = [...tap.matchAll(/^\s*1\.\.(\d+)\s*$/gm)];
  if (plans.length !== 1) {
    throw new Error(
      `Expected exactly one TAP plan, received ${plans.length}.`,
    );
  }

  const plan = Number.parseInt(plans[0][1], 10);
  const okCount = [...tap.matchAll(/^\s*ok\s+\d+\b/gm)].length;
  if (!Number.isSafeInteger(plan) || plan < 1) {
    throw new Error(`TAP plan is invalid: ${plans[0][1]}.`);
  }
  if (okCount !== plan) {
    throw new Error(
      `TAP expected ${plan} ok results, received ${okCount}.`,
    );
  }
  return { plan, okCount };
}

export function assertSafeCatalogueTarget({
  apiUrl,
  databaseUrl,
  target,
  expectedStagingRef,
  productionRef,
}) {
  const api = new URL(apiUrl);
  const database = new URL(databaseUrl);
  const isLocal =
    LOCAL_HOSTS.has(api.hostname) && LOCAL_HOSTS.has(database.hostname);
  if (isLocal) {
    if (target !== "local") {
      throw new Error("Local catalogue proof must use target=local.");
    }
    return {
      target: "local",
      apiProjectRef: "local",
      databaseProjectRef: "local",
      isLocal: true,
    };
  }

  if (target !== "staging") {
    throw new Error("Remote catalogue proof is staging-only.");
  }
  if (api.protocol !== "https:") {
    throw new Error("Remote catalogue API URL must use HTTPS.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol)) {
    throw new Error("Remote catalogue database URL must use PostgreSQL.");
  }
  if (!["require", "verify-ca", "verify-full"].includes(
    database.searchParams.get("sslmode") ?? "",
  )) {
    throw new Error("Remote catalogue database URL must require TLS.");
  }

  const stagingRef = requiredProjectRef(
    expectedStagingRef,
    "Expected staging project ref",
  );
  const production = requiredProjectRef(
    productionRef,
    "Expected production project ref",
  );
  if (stagingRef === production) {
    throw new Error("Staging and production project refs must differ.");
  }

  const apiRef = apiProjectRef(api);
  if (!apiRef) {
    throw new Error("Could not derive the API project ref.");
  }
  if (apiRef !== stagingRef || apiRef === production) {
    throw new Error("Catalogue API project ref is not isolated staging.");
  }

  const databaseRef = databaseProjectRef(database);
  if (!databaseRef) {
    throw new Error("Could not derive the database project ref.");
  }
  if (databaseRef !== stagingRef || databaseRef === production) {
    throw new Error("Catalogue database project ref is not isolated staging.");
  }
  if (apiRef !== databaseRef) {
    throw new Error("Catalogue API and database project refs do not match.");
  }

  return {
    target: "staging",
    apiProjectRef: apiRef,
    databaseProjectRef: databaseRef,
    isLocal: false,
  };
}
