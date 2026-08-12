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
  lostLeaseJobIds?: string[];
  calls: Array<{ name: string; args?: unknown }>;
};

declare global {
  // deno-lint-ignore no-var
  var __storageCleanupScenario: Scenario;
}

const functionSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const tempDir = await Deno.makeTempDir({ prefix: "process-storage-cleanup-test-" });
const mockClientPath = `${tempDir}/mockSupabase.ts`;
const transformedPath = `${tempDir}/index.ts`;

const fileUrl = (path: string) =>
  `file:///${path.replaceAll("\\", "/").replace(/^([A-Za-z]):/, "$1:")}`;

await Deno.writeTextFile(
  mockClientPath,
  `
export function createClient() {
  const scenario = globalThis.__storageCleanupScenario;
  return {
    rpc: async (name, args) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (name === "claim_storage_cleanup_jobs") {
        return { data: scenario.jobs, error: null };
      }
       if (name === "prepare_storage_cleanup_delete") {
         return {
           data: scenario.prepareResults?.[args.p_job_id] ?? "delete",
           error: null,
         };
       }
      return { data: null, error: { message: "unexpected rpc" } };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          scenario.calls.push({ name: "remove", args: { bucket, paths } });
          const failed = paths.some((path) => scenario.removeFailurePaths?.includes(path));
          return {
            data: null,
            error: failed ? { message: "storage unavailable" } : null,
          };
        },
      }),
    },
    from: (table) => ({
      update: (payload) => {
        const filters = [];
        const builder = {
          eq: (column, value) => {
            filters.push({ column, value });
            return builder;
          },
          then: (resolve) => {
            scenario.calls.push({ name: "update", args: { table, payload, filters } });
            return Promise.resolve(resolve({ data: null, error: null }));
          },
          select: (_columns) => {
            scenario.calls.push({ name: "update", args: { table, payload, filters } });
            const jobId = filters.find((filter) => filter.column === "id")?.value;
            return Promise.resolve({
              data: scenario.lostLeaseJobIds?.includes(jobId) ? [] : [{ id: jobId }],
              error: null,
            });
          },
        };
        return builder;
      },
    }),
  };
}
`,
);

const transformedSource = functionSource.replace(
  'import { createClient } from "npm:@supabase/supabase-js@2.57.2";',
  `import { createClient } from "${fileUrl(mockClientPath)}";`,
);
await Deno.writeTextFile(transformedPath, transformedSource);

const { handler, restore } = await captureHandler(
  import.meta.url,
  fileUrl(transformedPath),
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
