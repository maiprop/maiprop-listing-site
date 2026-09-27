import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type CleanupJob = {
  id: string;
  bucket: "listing-images" | "project-media";
  object_path: string;
  object_url: string;
  attempts: number;
  lease_token?: string;
};

type Scenario = {
  jobs: CleanupJob[];
  prepareResults?: Record<string, "delete" | "preserve" | "lost">;
  removeFailurePaths?: string[];
  providerRemove?: (bucket: string, paths: string[]) => Promise<{ message: string } | null>;
  lostLeaseJobIds?: string[];
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __storageCleanupScenario: Scenario;
}

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    CRON_SECRET: "test-cron-secret",
    SUPABASE_URL: "https://test-project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  },
);
restore();

const reset = (overrides: Partial<Scenario> = {}) => {
  globalThis.__storageCleanupScenario = {
    jobs: [],
    calls: [],
    ...overrides,
  };
};

const job = (overrides: Partial<CleanupJob> = {}): CleanupJob => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  bucket: "listing-images",
  object_path: "user/project/create/cover.jpg",
  object_url:
    "https://test-project.supabase.co/storage/v1/object/public/listing-images/user/project/create/cover.jpg",
  attempts: 1,
  lease_token: "lease-1",
  ...overrides,
});

Deno.test("Storage cleanup processor rejects requests without the cron secret", async () => {
  reset({ jobs: [job()] });
  const response = await handler(req("POST", {}));
  assertEquals(response.status, 401);
  assertEquals(globalThis.__storageCleanupScenario.calls, []);
});

Deno.test("Storage cleanup processor preserves committed objects and completes the job", async () => {
  const submitted = job();
  reset({ jobs: [submitted], prepareResults: { [submitted.id]: "preserve" } });

  const response = await handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, { claimed: 1, completed: 1, retried: 0, dead: 0 });
  assertEquals(
    globalThis.__storageCleanupScenario.calls.some((call) => call.name === "remove"),
    false,
  );
  assertEquals(
    globalThis.__storageCleanupScenario.calls.some((call) => call.name === "update"),
    false,
  );
});

Deno.test("Storage cleanup processor removes only the exact uncommitted object", async () => {
  const submitted = job();
  reset({ jobs: [submitted] });

  const response = await handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  assertEquals(response.status, 200);
  const remove = globalThis.__storageCleanupScenario.calls.find((call) => call.name === "remove");
  assertEquals(remove?.args, {
    bucket: submitted.bucket,
    paths: [submitted.object_path],
  });
  const update = globalThis.__storageCleanupScenario.calls.find((call) => call.name === "update");
  assertEquals(update?.args, {
    table: "storage_cleanup_jobs",
    payload: {
      status: "completed",
      completed_at: (update?.args as { payload: { completed_at: string } }).payload.completed_at,
      updated_at: (update?.args as { payload: { updated_at: string } }).payload.updated_at,
      last_error: null,
      lease_token: null,
      lease_expires_at: null,
    },
    filters: [
      { column: "id", value: submitted.id },
      { column: "status", value: "processing" },
      { column: "lease_token", value: submitted.lease_token },
    ],
  });
});

Deno.test("Storage cleanup processor prepares exact path deletion with the active lease", async () => {
  const submitted = job({ lease_token: "lease-1" });
  reset({ jobs: [submitted] });

  const response = await handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  assertEquals(response.status, 200);

  const prepare = globalThis.__storageCleanupScenario.calls.find((call) =>
    call.name === "rpc" &&
    (call.args as { name?: string }).name === "prepare_storage_cleanup_delete"
  );
  assertEquals(prepare?.args, {
    name: "prepare_storage_cleanup_delete",
    args: {
      p_job_id: submitted.id,
      p_lease_token: "lease-1",
    },
  });
  assertEquals(
    globalThis.__storageCleanupScenario.calls.some((call) =>
      call.name === "rpc" &&
      (call.args as { name?: string }).name === "is_storage_object_committed"
    ),
    false,
  );
});

Deno.test("Storage cleanup processor never finalizes or requeues after losing the lease", async () => {
  const submitted = job();
  reset({
    jobs: [submitted],
    lostLeaseJobIds: [submitted.id],
  });

  const response = await handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, { claimed: 1, completed: 0, retried: 0, dead: 0 });
  assertEquals(
    globalThis.__storageCleanupScenario.calls.filter((call) => call.name === "update").length,
    2,
  );
});

Deno.test("Storage cleanup processor retries transient removals and eventually marks dead jobs", async () => {
  const retryJob = job({ attempts: 2 });
  const deadJob = job({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    bucket: "project-media",
    object_path: "user/project/create/render.jpg",
    object_url:
      "https://test-project.supabase.co/storage/v1/object/public/project-media/user/project/create/render.jpg",
    attempts: 10,
  });
  reset({
    jobs: [retryJob, deadJob],
    removeFailurePaths: [retryJob.object_path, deadJob.object_path],
  });

  const response = await handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  const body = await response.json();
  assertEquals(response.status, 500);
  assertEquals(body, { claimed: 2, completed: 0, retried: 1, dead: 1 });

  const updates = globalThis.__storageCleanupScenario.calls
    .filter((call) => call.name === "update")
    .map((call) => (call.args as { payload: { status: string } }).payload.status);
  assertEquals(updates, ["pending", "dead"]);
});

Deno.test("controlled provider timeout after deletion retries an already-absent object", async () => {
  const submitted = job();
  const remoteObjects = new Set([submitted.object_path]);
  let calls = 0;
  const providerRemove = async (_bucket: string, paths: string[]) => {
    calls++;
    for (const path of paths) remoteObjects.delete(path);
    return calls === 1 ? { message: "response timeout after successful delete" } : null;
  };
  reset({ jobs: [submitted], providerRemove });
  const first = await handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  assertEquals((await first.json()).retried, 1);
  assertEquals(remoteObjects.size, 0);
  reset({ jobs: [{ ...submitted, attempts: 2, lease_token: "lease-2" }], providerRemove });
  const second = await handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  assertEquals((await second.json()).completed, 1);
  assertEquals(calls, 2);
});

Deno.test("delayed old provider delete reproduces activation gap despite token-scoped settlement", async () => {
  const submitted = job();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => entered = resolve);
  const barrier = new Promise<void>((resolve) => release = resolve);
  const remoteObjects = new Map([[submitted.object_path, "old object"]]);
  reset({ jobs: [submitted], providerRemove: async (_bucket, paths) => {
    entered();
    await barrier;
    for (const path of paths) remoteObjects.delete(path);
    return null;
  } });
  const request = handler(req("POST", {}, { "x-cron-secret": "test-cron-secret" }));
  await started;
  // Controlled provider model: old authorized call survives expiry/reclaim and a later writer.
  // PostgreSQL token checks protect settlement, but cannot recall this in-flight provider call.
  globalThis.__storageCleanupScenario.lostLeaseJobIds = [submitted.id];
  remoteObjects.set(submitted.object_path, "replacement referenced after later writer");
  release();
  const response = await request;
  assertEquals(await response.json(), { claimed: 1, completed: 0, retried: 0, dead: 0 });
  assertEquals(remoteObjects.has(submitted.object_path), false);
});
