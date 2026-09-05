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
const PREFIX = `ECAS project matrix ${RUN_ID}`;
const PROJECT_MEDIA_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

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
};

const ids = {
  organizationA: globalThis.crypto.randomUUID(),
  organizationB: globalThis.crypto.randomUUID(),
  projectA: globalThis.crypto.randomUUID(),
  projectB: globalThis.crypto.randomUUID(),
  projectBeforeMembershipProbe: globalThis.crypto.randomUUID(),
  projectForgedOwnerProbe: globalThis.crypto.randomUUID(),
  projectIneligibleOwnerProbe: globalThis.crypto.randomUUID(),
  projectFreeDeveloperProbe: globalThis.crypto.randomUUID(),
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
  return parseResponse(await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}

async function edge(account, name, body) {
  return parseResponse(await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      ...authHeaders(account.accessToken),
      Origin: "https://portal.maiprop.co",
    },
    body: JSON.stringify(body),
  }));
}

async function uploadProjectMediaObject(account, objectPath) {
  return parseResponse(
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/project-media/${objectPath}`,
      {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "image/png",
          "cache-control": "max-age=3600",
          "x-upsert": "false",
        },
        body: PROJECT_MEDIA_BYTES,
      },
    ),
  );
}

async function removeProjectMediaObject(account, objectPath) {
  return parseResponse(
    await fetch(`${SUPABASE_URL}/storage/v1/object/project-media`, {
      method: "DELETE",
      headers: authHeaders(account.accessToken),
      body: JSON.stringify({ prefixes: [objectPath] }),
    }),
  );
}

function expectSuccess(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed (${result.status}): ${boundedJson(result.body)}`);
  }
  return result.body;
}

function expectSingle(result, label) {
  const body = expectSuccess(result, label);
  const row = Array.isArray(body) ? body[0] : body?.data ?? body;
  if (!row || typeof row !== "object") {
    throw new Error(`${label} returned no row: ${boundedJson(body)}`);
  }
  return row;
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

async function createOrganization(account, id, suffix) {
  return rest(account, "organizations", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      id,
      name: `${PREFIX} ${suffix}`,
      slug: `ecas-project-${RUN_ID}-${suffix.toLowerCase()}`,
      created_by: account.userId,
    },
  });
}

async function createProject(account, id, organizationId, suffix, overrides = {}) {
  return rest(account, "projects", {
    method: "POST",
    prefer: "return=representation",
    body: {
      id,
      owner_id: account.userId,
      organization_id: organizationId,
      name: `${PREFIX} ${suffix}`,
      city: "Athens",
      status: "active",
      ...overrides,
    },
  });
}

async function patch(account, table, id, body) {
  return rest(account, `${table}?id=eq.${id}`, {
    method: "PATCH",
    prefer: "return=representation",
    body,
  });
}

async function remove(account, table, id) {
  return rest(account, `${table}?id=eq.${id}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

async function serviceRest(path, { method = "GET", prefer } = {}) {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return parseResponse(await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
  }));
}

async function removeProjectAsServiceRole(projectId) {
  return serviceRest(`projects?id=eq.${projectId}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

async function verifyProjectAbsentAsServiceRole(projectId) {
  return serviceRest(`projects?select=id&id=eq.${projectId}&limit=1`);
}

const evidence = [];
const record = (name) => evidence.push({ name, status: "passed" });
const cleanupErrors = [];
let actors = null;
const created = {
  units: [],
  media: [],
  leads: [],
  storageObjects: [],
};

async function cleanup() {
  if (!actors) return;
  const { developerA, developerB } = actors;
  const reactivation = await rest(
    developerB,
    `organization_memberships?organization_id=eq.${ids.organizationB}&user_id=eq.${developerA.userId}`,
    {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "active" },
    },
  );
  if (!reactivation.ok) {
    cleanupErrors.push(
      `membership reactivation: ${boundedJson(reactivation.body)}`,
    );
  }
  for (const id of created.leads) {
    const result = await remove(developerA, "project_leads", id);
    if (!result.ok) cleanupErrors.push(`lead ${id}: ${boundedJson(result.body)}`);
  }
  for (const id of created.media) {
    const result = await remove(developerA, "project_media", id);
    if (!result.ok) cleanupErrors.push(`media ${id}: ${boundedJson(result.body)}`);
  }
  for (const objectPath of created.storageObjects) {
    const result = await removeProjectMediaObject(developerA, objectPath);
    if (!result.ok) {
      cleanupErrors.push(
        `project media object ${objectPath}: ${boundedJson(result.body)}`,
      );
    }
  }
  for (const id of created.units) {
    const result = await remove(developerA, "project_units", id);
    if (!result.ok) cleanupErrors.push(`unit ${id}: ${boundedJson(result.body)}`);
  }
  for (const projectId of [
    ids.projectBeforeMembershipProbe,
    ids.projectForgedOwnerProbe,
    ids.projectIneligibleOwnerProbe,
    ids.projectFreeDeveloperProbe,
    ids.projectA,
    ids.projectB,
  ]) {
    const result = await removeProjectAsServiceRole(projectId);
    if (!result.ok) {
      cleanupErrors.push(`project ${projectId}: ${boundedJson(result.body)}`);
    }
    const verification = await verifyProjectAbsentAsServiceRole(projectId);
    if (!verification.ok || !Array.isArray(verification.body) || verification.body.length > 0) {
      cleanupErrors.push(
        `project ${projectId} absence: ${boundedJson(verification.body)}`,
      );
    }
  }
}

async function main() {
  actors = Object.fromEntries(
    await Promise.all(
      Object.entries(accounts).map(async ([name, account]) => [name, await signIn(account)]),
    ),
  );
  const { developerA, developerB, developerFree } = actors;
  record("real JWT authentication for project-role fixtures");

  expectSuccess(
    await createOrganization(developerA, ids.organizationA, "A"),
    "Organization A creation",
  );
  expectSuccess(
    await createOrganization(developerB, ids.organizationB, "B"),
    "Organization B creation",
  );
  expectFailure(
    await createProject(
      developerA,
      ids.projectBeforeMembershipProbe,
      ids.organizationB,
      "unauthorized before membership",
    ),
    "Unauthorized Organization B project creation",
    /row-level security|permission denied/i,
  );
  expectSuccess(
    await rest(developerB, "organization_memberships", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        organization_id: ids.organizationB,
        user_id: developerA.userId,
        role: "member",
        status: "active",
        invited_by: developerB.userId,
      },
    }),
    "Organization B Developer Pro membership setup",
  );
  record("isolated organization fixtures with an eligible shared developer");

  const projectA = expectSingle(
    await createProject(developerA, ids.projectA, ids.organizationA, "A"),
    "Project A creation",
  );
  const projectB = expectSingle(
    await createProject(developerA, ids.projectB, ids.organizationB, "B"),
    "Project B creation",
  );
  if (
    projectA.owner_id !== developerA.userId
    || projectB.owner_id !== developerA.userId
  ) {
    throw new Error("Project ownership did not match the authenticated creators");
  }
  expectFailure(
    await createProject(
      developerA,
      ids.projectForgedOwnerProbe,
      ids.organizationA,
      "forged owner",
      { owner_id: developerB.userId },
    ),
    "Forged project owner",
  );
  expectFailure(
    await createProject(
      developerB,
      ids.projectIneligibleOwnerProbe,
      ids.organizationB,
      "ineligible organization owner",
    ),
    "Non-developer Organization B owner project creation",
    /row-level security|permission denied/i,
  );
  expectFailure(
    await createProject(
      developerFree,
      ids.projectFreeDeveloperProbe,
      null,
      "free developer denied",
    ),
    "Developer Free project creation",
  );
  record("project creation tenant and Developer Pro pricing enforcement");

  expectSingle(
    await edge(developerA, "project-management", {
      action: "update_project",
      id: ids.projectA,
      updates: { description: `${PREFIX} updated by owner` },
    }),
    "Own project Edge update",
  );
  expectFailure(
    await edge(developerB, "project-management", {
      action: "update_project",
      id: ids.projectB,
      updates: { description: "ineligible organization owner update" },
    }),
    "Non-developer Organization B owner Edge update",
    /developer_role_required/,
  );
  expectFailure(
    await patch(developerA, "projects", ids.projectA, {
      organization_id: ids.organizationB,
    }),
    "Project organization reassignment while managing both organizations",
    /tenant resource ownership cannot be reassigned/,
  );
  expectFailure(
    await patch(developerA, "projects", ids.projectA, {
      owner_id: developerB.userId,
    }),
    "Project owner reassignment",
    /tenant resource ownership cannot be reassigned/,
  );
  record("own-project success and immutable cross-tenant project identity");

  const unitA = expectSingle(
    await edge(developerA, "project-management", {
      action: "create_unit",
      projectId: ids.projectA,
      unit: {
        unit_number: "A1",
        internal_sqm: 80,
        price: 240000,
        availability_status: "available",
      },
    }),
    "Organization A owner unit creation",
  );
  created.units.push(unitA.id);
  const unitB = expectSingle(
    await edge(developerA, "project-management", {
      action: "create_unit",
      projectId: ids.projectB,
      unit: {
        unit_number: "B1",
        internal_sqm: 90,
        price: 300000,
        availability_status: "available",
      },
    }),
    "Organization B authorized developer member unit creation",
  );
  created.units.push(unitB.id);
  const mediaObjectPath = `${developerA.userId}/${ids.projectA}/media/rendering-${RUN_ID}.png`;
  const mediaObjectUrl = `${SUPABASE_URL}/storage/v1/object/public/project-media/${mediaObjectPath}`;
  expectSuccess(
    await rest(developerA, "rpc/register_new_building_storage_upload", {
      method: "POST",
      body: {
        p_project_id: ids.projectA,
        p_bucket: "project-media",
        p_object_path: mediaObjectPath,
        p_object_url: mediaObjectUrl,
      },
    }),
    "Project media Storage registration",
  );
  expectSuccess(
    await uploadProjectMediaObject(developerA, mediaObjectPath),
    "Project media Storage upload",
  );
  created.storageObjects.push(mediaObjectPath);
  const mediaA = expectSingle(
    await edge(developerA, "project-management", {
      action: "add_media",
      projectId: ids.projectA,
      media: {
        url: mediaObjectUrl,
        media_type: "rendering",
        title: "ECAS staging media",
      },
    }),
    "Authorized organization member media creation",
  );
  created.media.push(mediaA.id);
  const leadA = expectSingle(
    await edge(developerA, "project-management", {
      action: "create_lead",
      projectId: ids.projectA,
      lead: {
        name: "ECAS Staging Lead",
        email: `ecas-${RUN_ID}@example.invalid`,
        unit_id: unitA.id,
      },
    }),
    "Authorized organization member lead creation",
  );
  created.leads.push(leadA.id);

  for (const [table, child] of [
    ["project_units", unitA],
    ["project_media", mediaA],
    ["project_leads", leadA],
  ]) {
    expectFailure(
      await patch(developerA, table, child.id, { project_id: ids.projectB }),
      `${table} project reassignment while managing both organizations`,
      /project child scope cannot be reassigned/,
    );
  }
  record("project child mutation isolation and immutable child scope");

  expectSuccess(
    await rest(developerB, `organization_memberships?organization_id=eq.${ids.organizationB}&user_id=eq.${developerA.userId}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "suspended" },
    }),
    "Membership suspension",
  );
  expectFailure(
    await edge(developerA, "project-management", {
      action: "update_project",
      id: ids.projectB,
      updates: { description: "stale-token suspended update" },
    }),
    "Suspended stale-token Project B update",
    /project_not_managed/,
  );
  expectFailure(
    await edge(developerA, "project-management", {
      action: "update_unit",
      projectId: ids.projectB,
      id: unitB.id,
      updates: { price: 301000 },
    }),
    "Suspended stale-token Project B unit update",
    /project_not_managed/,
  );
  expectSuccess(
    await rest(developerB, `organization_memberships?organization_id=eq.${ids.organizationB}&user_id=eq.${developerA.userId}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "active" },
    }),
    "Membership reactivation",
  );
  expectSingle(
    await edge(developerA, "project-management", {
      action: "update_project",
      id: ids.projectB,
      updates: { description: `${PREFIX} reactivated` },
    }),
    "Reactivated member project update",
  );
  record("project authorization reacts immediately to membership status");
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
    `run_id=${RUN_ID}; organization_ids=${ids.organizationA},${ids.organizationB}; `
      + `main_error=${mainDetail}; cleanup_error=${cleanupDetail}`,
  );
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  run_id: RUN_ID,
  evidence,
  cleanup: {
    project_resources: "passed",
    service_cleanup_required_for_organizations: [
      ids.organizationA,
      ids.organizationB,
    ],
  },
}, null, 2)}\n`);
