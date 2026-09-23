import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  user?: { id: string; email: string };
  profileRole?: string | null;
  roleSwitchInProgress?: boolean;
  proAllowed?: boolean;
  projectAuthorized?: boolean;
  projectOwnerId?: string;
  projectOrganizationId?: string | null;
  projectMediaUrls?: string[];
  projectMediaLookupError?: string;
  storageCleanupUpsertErrors?: Array<string | null>;
  deleteProjectError?: string;
  projectExistsAfterDeleteError?: boolean;
  projectReconciliationError?: string;
  existingUnit?: Record<string, unknown> | null;
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  var __projectManagementScenario: MockScenario;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  { RATE_LIMIT_FORCE_MEMORY: "true" },
);
restore();

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__projectManagementScenario = {
    calls: [],
    profileRole: "developer",
    proAllowed: true,
    projectAuthorized: true,
    user: { id: "11111111-1111-4111-8111-111111111111", email: "dev@test.local" },
    ...overrides,
  };
};

const authedJson = (body: unknown) =>
  req("POST", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-forwarded-for": crypto.randomUUID(),
  });

Deno.test("anonymous project-management invoke is rejected before writes", async () => {
  resetScenario();
  const res = await handler(req("POST", { action: "delete_unit", projectId: PROJECT_ID, id: ROW_ID }));

  assertEquals(res.status, 401);
  assertEquals(globalThis.__projectManagementScenario.calls.length, 0);
});

Deno.test("non-developer project-management invoke is rejected before writes", async () => {
  resetScenario({ profileRole: "agent" });
  const res = await handler(authedJson({ action: "delete_unit", projectId: PROJECT_ID, id: ROW_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 403);
  assertEquals(parsed.error, "developer_role_required");
  assert(!globalThis.__projectManagementScenario.calls.some((call) => call.name === "delete"));
});

Deno.test("free developers are denied before project-management writes", async () => {
  resetScenario({ proAllowed: false });
  const res = await handler(authedJson({
    action: "delete_media",
    projectId: PROJECT_ID,
    id: ROW_ID,
  }));

  assertEquals(res.status, 403);
  assertEquals(
    globalThis.__projectManagementScenario.calls.some((call) =>
      ["insert", "update", "delete", "audit"].includes(call.name)
    ),
    false,
  );
});

Deno.test("actor without personal or organization project access is denied before row mutation", async () => {
  resetScenario({ projectAuthorized: false });
  const res = await handler(authedJson({ action: "delete_media", projectId: PROJECT_ID, id: ROW_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 403);
  assertEquals(parsed.error, "project_not_managed");
  assert(!globalThis.__projectManagementScenario.calls.some((call) => call.name === "delete"));
});

Deno.test("create_unit forces project scope and strips client-controlled links", async () => {
  resetScenario();
  const res = await handler(authedJson({
    action: "create_unit",
    projectId: PROJECT_ID,
    unit: {
      project_id: OTHER_PROJECT_ID,
      listing_id: ROW_ID,
      unit_id: "A1",
      internal_sqm: 50,
      price: 300000,
      price_per_sqm: 1,
    },
  }));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data.project_id, PROJECT_ID);

  const insert = globalThis.__projectManagementScenario.calls.find((call) =>
    call.name === "insert" && (call.args as { table?: string })?.table === "project_units"
  );
  const payload = (insert?.args as { payload: Record<string, unknown> }).payload;
  assertEquals(payload.project_id, PROJECT_ID);
  assertEquals(payload.listing_id, undefined);
  assertEquals(payload.price_per_sqm, 6000);
});

Deno.test("update_unit recomputes price per sqm from the persisted unit state", async () => {
  resetScenario({
    existingUnit: {
      id: ROW_ID,
      project_id: PROJECT_ID,
      price: 300000,
      internal_sqm: 100,
      price_per_sqm: 3000,
    },
  });
  const res = await handler(authedJson({
    action: "update_unit",
    projectId: PROJECT_ID,
    id: ROW_ID,
    updates: {
      price: 315000,
      price_per_sqm: 3000,
    },
  }));

  assertEquals(res.status, 200);
  const update = globalThis.__projectManagementScenario.calls.find((call) =>
    call.name === "update" && (call.args as { table?: string })?.table === "project_units"
  );
  const payload = (update?.args as { payload: Record<string, unknown> }).payload;
  assertEquals(payload.price, 315000);
  assertEquals(payload.price_per_sqm, 3150);
});

Deno.test("organization project managers can update project inventory without personal-owner filters", async () => {
  resetScenario({
    projectOwnerId: "99999999-9999-4999-8999-999999999999",
    projectOrganizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  });
  const res = await handler(authedJson({
    action: "update_listing_cover",
    projectId: PROJECT_ID,
    listingId: ROW_ID,
    coverImageUrl: "https://cdn.test/cover.webp",
  }));

  assertEquals(res.status, 200);
  const update = globalThis.__projectManagementScenario.calls.find((call) =>
    call.name === "rpc"
    && (call.args as { name?: string })?.name ===
      "update_listing_cover_with_storage_for_service"
  );
  assertEquals(
    (update?.args as { args: Record<string, unknown> }).args,
    {
      p_actor_user_id: "11111111-1111-4111-8111-111111111111",
      p_project_id: PROJECT_ID,
      p_listing_id: ROW_ID,
      p_cover_image_url: "https://cdn.test/cover.webp",
    },
  );
  assert(!globalThis.__projectManagementScenario.calls.some((call) =>
    call.name === "update"
    && (call.args as { table?: string })?.table === "listings"
  ));
});

Deno.test("project media attachment uses the locked storage boundary", async () => {
  resetScenario();

  const res = await handler(authedJson({
    action: "add_media",
    projectId: PROJECT_ID,
    media: {
      url: "https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/media/render.jpg",
      media_type: "rendering",
      title: "Front render",
    },
  }));

  assertEquals(res.status, 200);
  const attachment = globalThis.__projectManagementScenario.calls.find((call) =>
    call.name === "rpc"
    && (call.args as { name?: string })?.name ===
      "attach_project_media_for_service"
  );
  assertEquals(
    (attachment?.args as { args: Record<string, unknown> }).args,
    {
      p_actor_user_id: "11111111-1111-4111-8111-111111111111",
      p_project_id: PROJECT_ID,
      p_media: {
        url: "https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/media/render.jpg",
        media_type: "rendering",
        title: "Front render",
      },
    },
  );
  assert(!globalThis.__projectManagementScenario.calls.some((call) =>
    call.name === "insert"
    && (call.args as { table?: string })?.table === "project_media"
  ));
});

Deno.test("project deletion uses the atomic tenant-checked database boundary", async () => {
  resetScenario({
    projectOwnerId: "99999999-9999-4999-8999-999999999999",
    projectOrganizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    projectMediaUrls: [
      `https://test.supabase.co/storage/v1/object/public/project-media/99999999-9999-4999-8999-999999999999/${PROJECT_ID}/create/render.jpg`,
      `https://test.supabase.co/storage/v1/object/public/project-media/99999999-9999-4999-8999-999999999999/${PROJECT_ID}/create/render.jpg`,
      `https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/${PROJECT_ID}/create/wrong-owner.jpg`,
      `https://test.supabase.co/storage/v1/object/public/project-media/99999999-9999-4999-8999-999999999999/${OTHER_PROJECT_ID}/create/wrong-project.jpg`,
      `https://test.supabase.co/storage/v1/object/public/listing-images/99999999-9999-4999-8999-999999999999/${PROJECT_ID}/create/listing.jpg`,
      `https://other-project.supabase.co/storage/v1/object/public/project-media/99999999-9999-4999-8999-999999999999/${PROJECT_ID}/create/foreign-origin.jpg`,
    ],
  });

  const res = await handler(authedJson({
    action: "delete_project",
    id: PROJECT_ID,
  }));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data, { id: PROJECT_ID });
  assert(
    globalThis.__projectManagementScenario.calls.some((call) =>
      call.name === "rpc"
      && (call.args as { name?: string }).name === "delete_project_for_service"
    ),
  );
  const lifecycleCalls = globalThis.__projectManagementScenario.calls.filter((call) =>
    call.name === "rpc"
    && [
      "stage_storage_cleanup_jobs_for_service",
      "settle_storage_cleanup_jobs_for_service",
    ].includes((call.args as { name?: string }).name ?? "")
  );
  assertEquals(lifecycleCalls.length, 2);
  const stagedCall = lifecycleCalls[0].args as {
    name: string;
    args: {
      p_owner_id: string;
      p_project_id: string;
      p_mode: string;
      p_objects: Array<Record<string, unknown>>;
    };
  };
  assertEquals(stagedCall.name, "stage_storage_cleanup_jobs_for_service");
  assertEquals(stagedCall.args.p_mode, "hold");
  assertEquals(stagedCall.args.p_objects.length, 1);
  assertEquals(stagedCall.args.p_objects[0].bucket, "project-media");
  assertEquals(
    stagedCall.args.p_objects[0].object_path,
    `99999999-9999-4999-8999-999999999999/${PROJECT_ID}/create/render.jpg`,
  );
  assertEquals(stagedCall.args.p_owner_id, "99999999-9999-4999-8999-999999999999");
  assertEquals(stagedCall.args.p_project_id, PROJECT_ID);
  const settledCall = lifecycleCalls[1].args as {
    name: string;
    args: { p_outcome: string; p_objects: Array<Record<string, unknown>> };
  };
  assertEquals(settledCall.name, "settle_storage_cleanup_jobs_for_service");
  assertEquals(settledCall.args.p_outcome, "release");
  assertEquals(settledCall.args.p_objects.length, 1);
  assertEquals(
    globalThis.__projectManagementScenario.calls.some((call) =>
      (call.args as { table?: string } | undefined)?.table === "listing_images"
    ),
    false,
  );
  assert(
    !globalThis.__projectManagementScenario.calls.some((call) => {
      const args = call.args as { table?: string } | undefined;
      return (call.name === "update" && args?.table === "listings")
        || (call.name === "delete" && args?.table === "projects");
    }),
  );
});

Deno.test("project deletion stops before the database transaction when durable cleanup staging fails", async () => {
  resetScenario({
    projectMediaUrls: [
      `https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/${PROJECT_ID}/create/render.jpg`,
    ],
    storageCleanupUpsertErrors: ["outbox unavailable"],
  });

  const res = await handler(authedJson({ action: "delete_project", id: PROJECT_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "outbox unavailable");
  assertEquals(
    globalThis.__projectManagementScenario.calls.some((call) =>
      call.name === "rpc"
      && (call.args as { name?: string }).name === "delete_project_for_service"
    ),
    false,
  );
});

Deno.test("project deletion stops when project media cannot be snapshotted safely", async () => {
  resetScenario({ projectMediaLookupError: "project media unavailable" });

  const res = await handler(authedJson({ action: "delete_project", id: PROJECT_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "project media unavailable");
  assertEquals(
    globalThis.__projectManagementScenario.calls.some((call) =>
      call.name === "rpc"
      && (call.args as { name?: string }).name === "delete_project_for_service"
    ),
    false,
  );
});

Deno.test("failed atomic deletion cancels the cleanup hold", async () => {
  resetScenario({
    projectMediaUrls: [
      `https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/${PROJECT_ID}/create/render.jpg`,
    ],
    deleteProjectError: "project deletion failed",
  });

  const res = await handler(authedJson({ action: "delete_project", id: PROJECT_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "project deletion failed");
  const lifecycleCalls = globalThis.__projectManagementScenario.calls.filter((call) =>
    call.name === "rpc"
    && [
      "stage_storage_cleanup_jobs_for_service",
      "settle_storage_cleanup_jobs_for_service",
    ].includes((call.args as { name?: string }).name ?? "")
  );
  assertEquals(lifecycleCalls.length, 2);
  assertEquals(
    (lifecycleCalls[1].args as { args: { p_outcome: string } }).args.p_outcome,
    "complete",
  );
});

Deno.test("post-commit deletion errors release cleanup after confirming the project is absent", async () => {
  resetScenario({
    projectMediaUrls: [
      `https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/${PROJECT_ID}/create/render.jpg`,
    ],
    deleteProjectError: "upstream response lost",
    projectExistsAfterDeleteError: false,
  });

  const res = await handler(authedJson({ action: "delete_project", id: PROJECT_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data, { id: PROJECT_ID });
  const lifecycleCalls = globalThis.__projectManagementScenario.calls.filter((call) =>
    call.name === "rpc"
    && [
      "stage_storage_cleanup_jobs_for_service",
      "settle_storage_cleanup_jobs_for_service",
    ].includes((call.args as { name?: string }).name ?? "")
  );
  assertEquals(lifecycleCalls.length, 2);
  assertEquals(
    (lifecycleCalls[1].args as { args: { p_outcome: string } }).args.p_outcome,
    "release",
  );
});

Deno.test("ambiguous deletion errors leave cleanup held when reconciliation fails", async () => {
  resetScenario({
    projectMediaUrls: [
      `https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/${PROJECT_ID}/create/render.jpg`,
    ],
    deleteProjectError: "upstream response lost",
    projectReconciliationError: "project reconciliation unavailable",
  });

  const res = await handler(authedJson({ action: "delete_project", id: PROJECT_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 400);
  assertEquals(parsed.error, "upstream response lost");
  const lifecycleCalls = globalThis.__projectManagementScenario.calls.filter((call) =>
    call.name === "rpc"
    && [
      "stage_storage_cleanup_jobs_for_service",
      "settle_storage_cleanup_jobs_for_service",
    ].includes((call.args as { name?: string }).name ?? "")
  );
  assertEquals(lifecycleCalls.length, 1);
  assertEquals(
    (lifecycleCalls[0].args as { args: { p_mode: string } }).args.p_mode,
    "hold",
  );
});

Deno.test("project deletion remains successful when releasing staged cleanup jobs must retry", async () => {
  resetScenario({
    projectMediaUrls: [
      `https://test.supabase.co/storage/v1/object/public/project-media/11111111-1111-4111-8111-111111111111/${PROJECT_ID}/create/render.jpg`,
    ],
    storageCleanupUpsertErrors: [null, "outbox release unavailable"],
  });

  const res = await handler(authedJson({ action: "delete_project", id: PROJECT_ID }));
  const parsed = await res.json();

  assertEquals(res.status, 200);
  assertEquals(parsed.data, { id: PROJECT_ID });
  const lifecycleCalls = globalThis.__projectManagementScenario.calls.filter((call) =>
    call.name === "rpc"
    && [
      "stage_storage_cleanup_jobs_for_service",
      "settle_storage_cleanup_jobs_for_service",
    ].includes((call.args as { name?: string }).name ?? "")
  );
  assertEquals(lifecycleCalls.length, 2);
  assertEquals(
    (lifecycleCalls[0].args as { args: { p_mode: string } }).args.p_mode,
    "hold",
  );
  assertEquals(
    (lifecycleCalls[1].args as { args: { p_outcome: string } }).args.p_outcome,
    "release",
  );
});
