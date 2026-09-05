const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/^['"]|['"]$/g, "");
};

const SUPABASE_URL = required("STAGING_SUPABASE_URL").replace(/\/+$/, "");
const ANON_KEY = required("STAGING_SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = required("STAGING_SUPABASE_SERVICE_ROLE_KEY");
const PASSWORD = required("STAGING_DEMO_PASSWORD");
const RUN_ID = globalThis.crypto.randomUUID();
const REQUEST_PREFIX = `ecas:${RUN_ID}:`;
const billingSubscriptionIds = {
  developerA: globalThis.crypto.randomUUID(),
  developerB: globalThis.crypto.randomUUID(),
};
const pricingConfigIds = {
  developerA: globalThis.crypto.randomUUID(),
  developerB: globalThis.crypto.randomUUID(),
};

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

const serviceHeaders = (prefer) => ({
  apikey: SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
  ...(prefer ? { Prefer: prefer } : {}),
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

async function serviceRequest(path, { method = "GET", body, prefer } = {}) {
  return parseResponse(await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: serviceHeaders(prefer),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}

const fixturePlans = {
  developerA: {
    planKey: "developer_pro",
    audience: "developer",
    module: "developer_subscription",
    label: "Developer Pro",
    amount: 129,
  },
  developerB: {
    planKey: "agent_basic",
    audience: "agent",
    module: "agent_subscription",
    label: "Agent Pro",
    amount: 149,
  },
};

const insertedPricingConfigIds = new Set();

function validatePricingConfig(row, expected) {
  const stripeProductId = row?.metadata?.stripe_product_id;
  const stripePriceId = row?.metadata?.stripe_price_id_monthly
    ?? row?.metadata?.stripe_monthly_price_id
    ?? row?.metadata?.stripe_price_id;
  if (
    row?.key !== expected.planKey
    || row?.audience !== expected.audience
    || row?.module !== expected.module
    || row?.is_active !== true
    || typeof stripeProductId !== "string"
    || typeof stripePriceId !== "string"
  ) {
    throw new Error(
      `Invalid canonical pricing config for ${expected.planKey}: ${boundedJson(row)}`,
    );
  }
  return { stripeProductId, stripePriceId };
}

async function readPricingConfig(planKey) {
  const result = expectSuccess(
    await serviceRequest(
      `pricing_configs?select=id,key,audience,module,is_active,metadata&key=eq.${encodeURIComponent(planKey)}`,
    ),
    `${planKey} pricing lookup`,
  );
  if (!Array.isArray(result) || result.length > 1) {
    throw new Error(`Unexpected ${planKey} pricing response: ${boundedJson(result)}`);
  }
  return result[0] ?? null;
}

async function ensurePricingConfigFixtures() {
  const resolved = {};
  for (const [accountName, expected] of Object.entries(fixturePlans)) {
    let row = await readPricingConfig(expected.planKey);
    if (!row) {
      const stripeProductId = `prod_ecas_stage_${RUN_ID}_${accountName}`;
      const stripePriceId = `price_ecas_stage_${RUN_ID}_${accountName}`;
      const inserted = expectSuccess(
        await serviceRequest("pricing_configs?on_conflict=key", {
          method: "POST",
          prefer: "resolution=ignore-duplicates,return=representation",
          body: {
            id: pricingConfigIds[accountName],
            key: expected.planKey,
            label: expected.label,
            description: `ECAS staging proof fixture ${RUN_ID}`,
            audience: expected.audience,
            module: expected.module,
            unit: "monthly",
            currency: "EUR",
            amount: expected.amount,
            is_active: true,
            metadata: {
              stripe_product_id: stripeProductId,
              stripe_price_id: stripePriceId,
              stripe_price_id_monthly: stripePriceId,
              ecas_fixture: "staging-promotion-entitlement-matrix",
              ecas_run_id: RUN_ID,
            },
          },
        }),
        `${expected.planKey} pricing fixture creation`,
      );
      if (!Array.isArray(inserted) || inserted.length > 1) {
        throw new Error(`Unexpected pricing insert response: ${boundedJson(inserted)}`);
      }
      if (inserted.length === 1) {
        if (inserted[0].id !== pricingConfigIds[accountName]) {
          throw new Error(`Unexpected inserted pricing identity: ${boundedJson(inserted)}`);
        }
        insertedPricingConfigIds.add(inserted[0].id);
      }
      row = await readPricingConfig(expected.planKey);
    }
    resolved[accountName] = validatePricingConfig(row, expected);
  }
  return resolved;
}

async function seedBillingSubscriptionFixtures(pricingConfigs) {
  const observedAt = new Date().toISOString();
  const periodStart = new Date(Date.now() - 86_400_000).toISOString();
  const periodEnd = new Date(Date.now() + 32 * 86_400_000).toISOString();
  const fixtures = Object.entries(fixturePlans).map(([accountName, expected]) => {
    const pricing = pricingConfigs[accountName];
    return {
      id: billingSubscriptionIds[accountName],
      user_id: accounts[accountName].expectedUserId,
      stripe_customer_id: `cus_ecas_stage_${RUN_ID}_${accountName}`,
      stripe_subscription_id: `sub_ecas_stage_${RUN_ID}_${accountName}`,
      stripe_product_id: pricing.stripeProductId,
      stripe_price_id: pricing.stripePriceId,
      plan_key: expected.planKey,
      audience: expected.audience,
      status: "active",
      billing_cycle: "monthly",
      current_period_start: periodStart,
      current_period_end: periodEnd,
      runtime_mode: "test",
      livemode: false,
      state_source: "legacy",
      state_observed_at: observedAt,
      metadata: {
        ecas_fixture: "staging-promotion-entitlement-matrix",
        ecas_run_id: RUN_ID,
      },
    };
  });

  const inserted = expectSuccess(
    await serviceRequest("billing_subscriptions", {
      method: "POST",
      body: fixtures,
      prefer: "return=representation",
    }),
    "Durable billing subscription fixture creation",
  );
  const insertedIds = new Set(
    Array.isArray(inserted) ? inserted.map((row) => row.id) : [],
  );
  if (
    insertedIds.size !== Object.keys(billingSubscriptionIds).length
    || Object.values(billingSubscriptionIds).some((id) => !insertedIds.has(id))
  ) {
    throw new Error(`Incomplete billing fixture creation: ${boundedJson(inserted)}`);
  }
}

function allocationFilter(select) {
  const filters = {
    billing_subscription_id: `in.(${Object.values(billingSubscriptionIds).join(",")})`,
    request_key: `like.${REQUEST_PREFIX}*`,
  };
  const parameters = new URLSearchParams({
    ...(select ? { select } : {}),
    ...filters,
  });
  return `listing_promotion_allocations?${parameters}`;
}

async function cleanupPromotionAllocationFixtures() {
  const expectedSubscriptionIds = new Set(Object.values(billingSubscriptionIds));
  const result = await serviceRequest(allocationFilter(), {
    method: "DELETE",
    prefer: "return=representation",
  });
  if (!result.ok) return result;
  if (
    !Array.isArray(result.body)
    || result.body.some((row) => (
      !expectedSubscriptionIds.has(row.billing_subscription_id)
      || !row.request_key?.startsWith(REQUEST_PREFIX)
    ))
  ) {
    return {
      status: 500,
      ok: false,
      body: { error: "unexpected_promotion_allocation_cleanup_response" },
    };
  }
  const remaining = await serviceRequest(allocationFilter("id"));
  if (!remaining.ok || !Array.isArray(remaining.body) || remaining.body.length > 0) {
    return {
      status: remaining.status,
      ok: false,
      body: {
        error: "promotion_allocation_cleanup_incomplete",
        remaining: remaining.body,
      },
    };
  }
  return result;
}

async function cleanupBillingSubscriptionFixtures() {
  const expectedIds = new Set(Object.values(billingSubscriptionIds));
  const result = await serviceRequest(
    `billing_subscriptions?id=in.(${Object.values(billingSubscriptionIds).join(",")})`,
    { method: "DELETE", prefer: "return=representation" },
  );
  if (!result.ok) return result;
  if (
    !Array.isArray(result.body)
    || result.body.some((row) => !expectedIds.has(row.id))
  ) {
    return {
      status: 500,
      ok: false,
      body: { error: "unexpected_billing_fixture_cleanup_response" },
    };
  }
  const remaining = await serviceRequest(
    `billing_subscriptions?select=id&id=in.(${Object.values(billingSubscriptionIds).join(",")})`,
  );
  if (!remaining.ok || !Array.isArray(remaining.body) || remaining.body.length > 0) {
    return {
      status: remaining.status,
      ok: false,
      body: {
        error: "billing_fixture_cleanup_incomplete",
        remaining: remaining.body,
      },
    };
  }
  return result;
}

async function cleanupPricingConfigFixtures() {
  if (insertedPricingConfigIds.size > 0) {
    const result = await serviceRequest(
      `pricing_configs?id=in.(${[...insertedPricingConfigIds].join(",")})`,
      { method: "DELETE", prefer: "return=representation" },
    );
    if (!result.ok) return result;
    if (
      !Array.isArray(result.body)
      || result.body.some((row) => !insertedPricingConfigIds.has(row.id))
    ) {
      return {
        status: 500,
        ok: false,
        body: { error: "unexpected_pricing_fixture_cleanup_response" },
      };
    }
  }
  const remaining = await serviceRequest(
    `pricing_configs?select=id&id=in.(${Object.values(pricingConfigIds).join(",")})`,
  );
  if (!remaining.ok || !Array.isArray(remaining.body) || remaining.body.length > 0) {
    return {
      status: remaining.status,
      ok: false,
      body: {
        error: "pricing_fixture_cleanup_incomplete",
        remaining: remaining.body,
      },
    };
  }
  return { status: 200, ok: true, body: [] };
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
  if (actors) {
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
  const allocationResult = await cleanupPromotionAllocationFixtures();
  if (!allocationResult.ok) {
    cleanupErrors.push(
      `delete promotion allocations: ${boundedJson(allocationResult.body)}`,
    );
  } else {
    const billingResult = await cleanupBillingSubscriptionFixtures();
    if (!billingResult.ok) {
      cleanupErrors.push(`delete billing fixtures: ${boundedJson(billingResult.body)}`);
    } else {
      const pricingResult = await cleanupPricingConfigFixtures();
      if (!pricingResult.ok) {
        cleanupErrors.push(`delete pricing fixtures: ${boundedJson(pricingResult.body)}`);
      }
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

  const pricingConfigs = await ensurePricingConfigFixtures();
  record("canonical pricing dependencies are present and validated");
  await seedBillingSubscriptionFixtures(pricingConfigs);
  record("durable billing subscription fixtures are active and runtime-scoped");

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
    promotion_allocation_history: "deleted",
    billing_subscription_fixtures: "deleted",
    inserted_pricing_config_fixtures: "deleted",
    service_cleanup_required_for_allocation_history: false,
  },
}, null, 2)}\n`);
