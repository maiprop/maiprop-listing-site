const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/^['"]|['"]$/g, "");
};

const SUPABASE_URL = required("STAGING_SUPABASE_URL").replace(/\/+$/, "");
const ANON_KEY = required("STAGING_SUPABASE_ANON_KEY");
const PASSWORD = required("STAGING_DEMO_PASSWORD");
const RUN_ID = globalThis.crypto.randomUUID();
const REQUEST_PREFIX = `ecas:${RUN_ID}:`;

const accounts = {
  developerA: {
    email: process.env.STAGING_DEVELOPER_A_EMAIL ?? "developer.pro@maiprop.demo",
    expectedUserId: "6214f804-492d-491b-9ebf-02d8bfd576f5",
  },
  developerB: {
    email: process.env.STAGING_DEVELOPER_B_EMAIL ?? "agent.pro@maiprop.demo",
    expectedUserId: "942130d0-c41c-4cde-8664-34c00cac32fb",
  },
};

const authHeaders = (token) => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

function boundedJson(value, maxLength = 800) {
  const serialized = JSON.stringify(value ?? "");
  return serialized.length <= maxLength
    ? serialized
    : `${serialized.slice(0, maxLength)}...[truncated]`;
}

async function parseResponse(response) {
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, ok: response.ok, body };
}

async function signIn(account) {
  const result = await parseResponse(await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: account.email, password: PASSWORD }),
    },
  ));
  if (!result.ok) {
    throw new Error(`Sign-in failed for ${account.email}: ${boundedJson(result.body)}`);
  }
  if (result.body?.user?.id !== account.expectedUserId) {
    throw new Error(`Unexpected user identity for ${account.email}`);
  }
  return {
    email: account.email,
    userId: result.body.user.id,
    accessToken: result.body.access_token,
  };
}

async function rpc(account, name, body = {}) {
  return parseResponse(await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: authHeaders(account.accessToken),
    body: JSON.stringify(body),
  }));
}

function expectSuccess(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed (${result.status}): ${boundedJson(result.body)}`);
  }
  return result.body;
}

function expectFailure(result, label, expectedPattern) {
  if (result.ok) {
    throw new Error(`${label} unexpectedly succeeded (${result.status})`);
  }
  const errorText = boundedJson(result.body);
  if (expectedPattern && !expectedPattern.test(errorText)) {
    throw new Error(
      `${label} failed for the wrong reason (${result.status}): ${errorText}`,
    );
  }
}

function listingPayload(title, overrides = {}) {
  return {
    title,
    city: "Athens",
    address: "ECAS staging only",
    price: 250000,
    sqm: 80,
    property_type: "apartment",
    listing_type: "sale",
    status: "active",
    ...overrides,
  };
}

async function createListing(account, suffix, overrides = {}) {
  return rpc(account, "create_listing_for_user", {
    p_payload: listingPayload(`ECAS promotion matrix ${RUN_ID} ${suffix}`, overrides),
    p_organization_id: null,
  });
}

async function deleteListing(account, listingId) {
  return rpc(account, "delete_listing_for_user", { p_id: listingId });
}

async function activate(account, listingId, promotionType, requestSuffix) {
  return rpc(account, "activate_listing_promotion", {
    p_listing_id: listingId,
    p_promotion_type: promotionType,
    p_request_key: `${REQUEST_PREFIX}${requestSuffix}`,
  });
}

async function deactivate(account, listingId, promotionType) {
  return rpc(account, "deactivate_listing_promotion", {
    p_listing_id: listingId,
    p_promotion_type: promotionType,
  });
}

const evidence = [];
const record = (name) => evidence.push({ name, status: "passed" });
const listings = [];
const activePromotions = [];
const cleanupErrors = [];
let actors = null;

async function cleanup() {
  if (!actors) return;
  for (const promotion of activePromotions.reverse()) {
    const result = await deactivate(
      promotion.account,
      promotion.listingId,
      promotion.type,
    );
    if (!result.ok) {
      cleanupErrors.push(
        `deactivate ${promotion.listingId}/${promotion.type}: ${boundedJson(result.body)}`,
      );
    }
  }
  for (const listing of listings.reverse()) {
    const result = await deleteListing(listing.account, listing.id);
    if (!result.ok) {
      cleanupErrors.push(`delete listing ${listing.id}: ${boundedJson(result.body)}`);
    }
  }
}

function assertBalance(balance, expected) {
  for (const type of ["spotlight", "priority"]) {
    for (const key of ["included", "used", "remaining"]) {
      if (balance?.[type]?.[key] !== expected[type][key]) {
        throw new Error(
          `Unexpected ${type}.${key}: ${boundedJson(balance?.[type])}`,
        );
      }
    }
  }
}

async function main() {
  actors = Object.fromEntries(
    await Promise.all(
      Object.entries(accounts).map(async ([name, account]) => [name, await signIn(account)]),
    ),
  );
  const { developerA, developerB } = actors;
  record("real JWT authentication for promotion owners");

  const balanceBefore = expectSuccess(
    await rpc(developerA, "get_listing_promotion_balance"),
    "Initial Developer Pro promotion balance",
  );
  assertBalance(balanceBefore, {
    spotlight: { included: 1, used: 0, remaining: 1 },
    priority: { included: 1, used: 0, remaining: 1 },
  });
  record("canonical paid Developer Pro grants exactly one Spotlight and one Priority");

  const listingA1 = expectSuccess(
    await createListing(developerA, "spotlight"),
    "Developer A Spotlight listing creation",
  );
  const listingA2 = expectSuccess(
    await createListing(developerA, "priority"),
    "Developer A Priority listing creation",
  );
  const listingA3 = expectSuccess(
    await createListing(developerA, "second spotlight"),
    "Developer A second Spotlight listing creation",
  );
  const listingA4 = expectSuccess(
    await createListing(developerA, "second priority"),
    "Developer A second Priority listing creation",
  );
  const openHouse = expectSuccess(
    await createListing(developerA, "open house", {
      listing_type: "open_house",
      open_house_date: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }),
    "Developer A Open House listing creation",
  );
  const listingB = expectSuccess(
    await createListing(developerB, "cross-tenant control"),
    "Developer B listing creation",
  );
  for (const [account, row] of [
    [developerA, listingA1],
    [developerA, listingA2],
    [developerA, listingA3],
    [developerA, listingA4],
    [developerA, openHouse],
    [developerB, listingB],
  ]) {
    listings.push({ account, id: row.id });
  }

  expectFailure(
    await activate(developerA, listingB.id, "spotlight", "cross-tenant"),
    "Cross-tenant promotion activation",
    /listing_promotion_forbidden/,
  );
  expectFailure(
    await activate(developerA, openHouse.id, "priority", "open-house"),
    "Open House promotion activation",
    /open_house_promotion_not_supported/,
  );
  const balanceAfterDenied = expectSuccess(
    await rpc(developerA, "get_listing_promotion_balance"),
    "Balance after denied promotion attempts",
  );
  assertBalance(balanceAfterDenied, {
    spotlight: { included: 1, used: 0, remaining: 1 },
    priority: { included: 1, used: 0, remaining: 1 },
  });
  record("cross-tenant and Open House denials do not consume inventory");

  expectSuccess(
    await activate(developerA, listingA1.id, "spotlight", "spotlight-1"),
    "First included Spotlight activation",
  );
  activePromotions.push({
    account: developerA,
    listingId: listingA1.id,
    type: "spotlight",
  });
  expectSuccess(
    await activate(developerA, listingA2.id, "priority", "priority-1"),
    "First included Priority activation",
  );
  activePromotions.push({
    account: developerA,
    listingId: listingA2.id,
    type: "priority",
  });
  expectSuccess(
    await activate(developerA, listingA1.id, "spotlight", "spotlight-1"),
    "Idempotent Spotlight replay",
  );
  const balanceConsumed = expectSuccess(
    await rpc(developerA, "get_listing_promotion_balance"),
    "Consumed Developer Pro promotion balance",
  );
  assertBalance(balanceConsumed, {
    spotlight: { included: 1, used: 1, remaining: 0 },
    priority: { included: 1, used: 1, remaining: 0 },
  });
  record("included credits activate once and request replay is idempotent");

  expectFailure(
    await activate(developerA, listingA3.id, "spotlight", "spotlight-2"),
    "Second monthly Spotlight activation",
    /spotlight_entitlement_required/,
  );
  expectFailure(
    await activate(developerA, listingA4.id, "priority", "priority-2"),
    "Second monthly Priority activation",
    /priority_entitlement_required/,
  );
  record("second monthly Developer Pro Spotlight and Priority require add-ons");
}

let mainError = null;
try {
  await main();
} catch (error) {
  mainError = error;
} finally {
  try {
    await cleanup();
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error.message : String(error));
  }
}

if (mainError || cleanupErrors.length > 0) {
  const mainDetail = mainError instanceof Error
    ? mainError.stack ?? mainError.message
    : mainError
      ? String(mainError)
      : "none";
  const cleanupDetail = cleanupErrors.length > 0
    ? cleanupErrors.join("; ")
    : "none";
  throw new Error(
    `run_id=${RUN_ID}; request_prefix=${REQUEST_PREFIX}; `
      + `main_error=${mainDetail}; cleanup_error=${cleanupDetail}`,
  );
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  run_id: RUN_ID,
  request_prefix: REQUEST_PREFIX,
  evidence,
  cleanup: {
    listings_and_active_projection: "passed",
    service_cleanup_required_for_allocation_history: true,
  },
}, null, 2)}\n`);
