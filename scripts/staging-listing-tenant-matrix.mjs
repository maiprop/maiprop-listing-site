const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/^['"]|['"]$/g, "");
};

const SUPABASE_URL = required("STAGING_SUPABASE_URL").replace(/\/+$/, "");
const ANON_KEY = required("STAGING_SUPABASE_ANON_KEY");
const PASSWORD = required("STAGING_DEMO_PASSWORD");

const accounts = {
  developerA: {
    email: process.env.STAGING_DEVELOPER_A_EMAIL ?? "developer.pro@maiprop.demo",
    expectedUserId: "6214f804-492d-491b-9ebf-02d8bfd576f5",
  },
  developerB: {
    email: process.env.STAGING_DEVELOPER_B_EMAIL ?? "agent.pro@maiprop.demo",
    expectedUserId: "942130d0-c41c-4cde-8664-34c00cac32fb",
  },
  developerFree: {
    email: process.env.STAGING_DEVELOPER_FREE_EMAIL ?? "developer.free@maiprop.demo",
    expectedUserId: "ff122ceb-4012-42f8-bb97-6ab71b522036",
  },
  sellerFree: {
    email: process.env.STAGING_SELLER_FREE_EMAIL ?? "seller.free@maiprop.demo",
    expectedUserId: "2c141e0a-4ccf-4dec-ac99-c2d6a01747e2",
  },
};

const organizationA = "ec260001-0000-4000-8000-000000000001";
const organizationB = "ec260001-0000-4000-8000-000000000002";

const authHeaders = (token) => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

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

function boundedJson(value, maxLength = 800) {
  const serialized = JSON.stringify(value ?? "");
  return serialized.length <= maxLength
    ? serialized
    : `${serialized.slice(0, maxLength)}...[truncated]`;
}

async function signIn(account) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: account.email, password: PASSWORD }),
    },
  );
  const result = await parseResponse(response);
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

async function rest(account, path, { method = "GET", body, prefer } = {}) {
  const headers = authHeaders(account.accessToken);
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(response);
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

async function createListing(account, title, organizationId = null, overrides = {}) {
  return rest(account, "rpc/create_listing_for_user", {
    method: "POST",
    body: {
      p_payload: listingPayload(title, overrides),
      p_organization_id: organizationId,
    },
  });
}

async function updateListing(account, listingId, updates) {
  return rest(account, "rpc/update_listing_for_user", {
    method: "POST",
    body: { p_id: listingId, p_updates: updates },
  });
}

async function deleteListing(account, listingId) {
  return rest(account, "rpc/delete_listing_for_user", {
    method: "POST",
    body: { p_id: listingId },
  });
}

async function setMembershipRole(owner, userId, role, status = "active") {
  const query =
    `organization_memberships?organization_id=eq.${organizationA}` +
    `&user_id=eq.${userId}`;
  return rest(owner, query, {
    method: "PATCH",
    body: { role, status },
    prefer: "return=minimal",
  });
}

const evidence = [];
const record = (name, status = "passed") => evidence.push({ name, status });

async function main() {
  const [developerA, developerB, developerFree, sellerFree] = await Promise.all(
    Object.values(accounts).map(signIn),
  );
  record("real JWT authentication for four role/tier fixtures");

  expectSuccess(
    await rest(developerA, "organizations", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        id: organizationA,
        name: "ECAS Tenant Matrix A",
        slug: "ecas-tenant-matrix-a",
        created_by: developerA.userId,
      },
    }),
    "Developer A organization creation",
  );
  expectSuccess(
    await rest(developerB, "organizations", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        id: organizationB,
        name: "ECAS Tenant Matrix B",
        slug: "ecas-tenant-matrix-b",
        created_by: developerB.userId,
      },
    }),
    "Developer B organization creation",
  );
  record("caller-owned organization creation");

  const listingA = expectSuccess(
    await createListing(
      developerA,
      "ECAS tenant matrix organization A",
      organizationA,
    ),
    "Organization A listing creation",
  );
  const listingB = expectSuccess(
    await createListing(
      developerB,
      "ECAS tenant matrix organization B",
      organizationB,
    ),
    "Organization B listing creation",
  );
  if (
    listingA.owner_id !== developerA.userId
    || listingA.organization_id !== organizationA
    || listingB.owner_id !== developerB.userId
    || listingB.organization_id !== organizationB
  ) {
    throw new Error("Server-derived listing ownership did not match the acting tenant");
  }
  record("server-derived personal and organization ownership");

  expectSuccess(
    await updateListing(developerA, listingA.id, {
      title: "ECAS tenant matrix organization A updated",
    }),
    "Own-tenant listing update",
  );
  expectFailure(
    await updateListing(developerA, listingB.id, { title: "Cross-tenant write" }),
    "Cross-tenant listing update",
    /listing_not_managed/,
  );
  expectFailure(
    await deleteListing(developerA, listingB.id),
    "Cross-tenant listing delete",
    /listing_not_managed/,
  );
  record("own-tenant success and cross-tenant update/delete denial");

  expectFailure(
    await createListing(
      developerA,
      "ECAS tenant matrix unauthorized organization",
      organizationB,
    ),
    "Unauthorized organization listing creation",
    /organization_listing_not_managed/,
  );
  expectFailure(
    await rest(developerA, "rpc/create_listing_for_user", {
      method: "POST",
      body: {
        p_payload: listingPayload("ECAS tenant matrix forged ownership", {
          owner_id: developerB.userId,
          organization_id: organizationB,
          project_id: "ec260001-0000-4000-8000-000000000004",
          is_featured: true,
          featured_until: "2099-01-01T00:00:00Z",
          priority_placement: 100,
          priority_until: "2099-01-01T00:00:00Z",
        }),
        p_organization_id: organizationA,
      },
    }),
    "Forged ownership and promotion payload",
    /listing_fields_not_writable/,
  );
  expectFailure(
    await updateListing(developerA, listingA.id, {
      organization_id: organizationB,
    }),
    "Listing organization reassignment",
    /listing_fields_not_writable/,
  );
  record("ownership, project, and paid-promotion field forgery denial");

  for (const tags of [
    ["source:maiprop-os"],
    ["os_auction:forged"],
    ["auction_pool:priority"],
  ]) {
    expectFailure(
      await createListing(
        developerA,
        `ECAS tenant matrix forged auction ${tags[0]}`,
        organizationA,
        { listing_type: "auction", tags },
      ),
      `Reserved auction provenance ${tags[0]}`,
      /listing_reserved_tags_not_writable/,
    );
  }
  expectFailure(
    await rest(developerA, "listings", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        ...listingPayload("ECAS tenant matrix raw table write"),
        owner_id: developerA.userId,
      },
    }),
    "Raw listing table insert",
  );
  record("reserved OS provenance and raw table write denial");

  expectSuccess(
    await rest(developerA, "organization_memberships", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        organization_id: organizationA,
        user_id: developerB.userId,
        role: "viewer",
        status: "active",
        invited_by: developerA.userId,
      },
    }),
    "Viewer membership setup",
  );
  for (const role of ["viewer", "billing_admin", "security_admin"]) {
    expectSuccess(
      await setMembershipRole(developerA, developerB.userId, role),
      `${role} role setup`,
    );
    expectFailure(
      await createListing(
        developerB,
        `ECAS tenant matrix denied ${role}`,
        organizationA,
      ),
      `${role} listing creation`,
      /organization_listing_not_managed/,
    );
  }
  expectSuccess(
    await setMembershipRole(developerA, developerB.userId, "member"),
    "Member role setup",
  );
  const memberListing = expectSuccess(
    await createListing(
      developerB,
      "ECAS tenant matrix member-managed listing",
      organizationA,
    ),
    "Active member listing creation",
  );
  record("organization role capability matrix");

  expectSuccess(
    await setMembershipRole(developerA, developerB.userId, "member", "suspended"),
    "Membership suspension",
  );
  expectFailure(
    await updateListing(developerB, memberListing.id, {
      title: "Suspended stale-token update",
    }),
    "Suspended member stale-token update",
    /listing_not_managed/,
  );
  expectFailure(
    await createListing(
      developerB,
      "ECAS tenant matrix suspended stale-token create",
      organizationA,
    ),
    "Suspended member stale-token creation",
    /organization_listing_not_managed/,
  );
  expectSuccess(
    await setMembershipRole(developerA, developerB.userId, "member", "active"),
    "Membership reactivation",
  );
  expectSuccess(
    await updateListing(developerB, memberListing.id, {
      title: "ECAS tenant matrix reactivated member",
    }),
    "Reactivated member update",
  );
  record("membership suspension and stale-JWT denial");

  expectFailure(
    await createListing(
      developerFree,
      "ECAS tenant matrix free developer denied",
      null,
    ),
    "Developer Free listing creation",
    /listing_not_allowed/,
  );
  record("Developer Free pricing enforcement");

  const concurrentResults = await Promise.all([
    createListing(sellerFree, "ECAS tenant matrix concurrent seller A"),
    createListing(sellerFree, "ECAS tenant matrix concurrent seller B"),
  ]);
  const concurrentSuccesses = concurrentResults.filter((result) => result.ok);
  const concurrentFailures = concurrentResults.filter((result) => !result.ok);
  if (concurrentSuccesses.length !== 1 || concurrentFailures.length !== 1) {
    throw new Error(
      `Expected one final-slot success and one failure; got ${concurrentSuccesses.length}/${concurrentFailures.length}`,
    );
  }
  expectFailure(
    concurrentFailures[0],
    "Concurrent final-slot loser",
    /listing_limit_reached/,
  );
  record("race-resistant final free listing slot and terminal-row exclusion");

  expectSuccess(
    await deleteListing(developerB, memberListing.id),
    "Member-managed listing cleanup",
  );
  expectSuccess(
    await deleteListing(developerA, listingA.id),
    "Organization A listing cleanup",
  );
  expectSuccess(
    await deleteListing(developerB, listingB.id),
    "Organization B listing cleanup",
  );
  record("authorized listing deletion");

  process.stdout.write(`${JSON.stringify({ ok: true, evidence }, null, 2)}\n`);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${detail.slice(0, 4000)}\n`);
  process.exitCode = 1;
});
