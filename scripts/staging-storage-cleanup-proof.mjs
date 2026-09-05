import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const EXPECTED_STAGING_REF = "xsiehskfgeoqyazcgauv";
const PRODUCTION_REF = "qvvicunqcrwpioqnvzxf";
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
    "base64",
  ),
);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/^['"]|['"]$/g, "");
}

const projectRef = required("STAGING_SUPABASE_PROJECT_REF");
const supabaseUrl = required("STAGING_SUPABASE_URL").replace(/\/+$/, "");
const anonKey = required("STAGING_SUPABASE_ANON_KEY");
const serviceRoleKey = required("STAGING_SUPABASE_SERVICE_ROLE_KEY");
const destructiveAck = required("STAGING_STORAGE_PROOF_ACK");

if (
  projectRef !== EXPECTED_STAGING_REF
  || projectRef === PRODUCTION_REF
  || new URL(supabaseUrl).hostname !== `${projectRef}.supabase.co`
  || destructiveAck !== "staging-only"
) {
  throw new Error("Storage cleanup proof is restricted to the designated staging project");
}

const runId = globalThis.crypto.randomUUID();
const password = `Ecas-${globalThis.crypto.randomUUID()}-aA9!`;
const email = `ecas-storage-${runId}@example.invalid`;
const supabaseClientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
};
const admin = createClient(supabaseUrl, serviceRoleKey, supabaseClientOptions);
const publicClient = createClient(supabaseUrl, anonKey, supabaseClientOptions);

const ids = {
  project: globalThis.crypto.randomUUID(),
  abandonedProject: globalThis.crypto.randomUUID(),
  raceProject: globalThis.crypto.randomUUID(),
  deadProject: globalThis.crypto.randomUUID(),
};
const paths = {
  cover: null,
  additional: null,
  projectMedia: null,
  abandoned: null,
  race: null,
  dead: null,
};
const evidence = [];
const cleanupErrors = [];
let userId = null;
let accessToken = null;

const record = (name, detail = "passed") => evidence.push({ name, detail });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function bounded(value, maxLength = 800) {
  const serialized = JSON.stringify(value ?? "");
  return serialized.length <= maxLength
    ? serialized
    : `${serialized.slice(0, maxLength)}...[truncated]`;
}

function expectNoError(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${bounded(result.error)}`);
  }
  return result.data;
}

function publicUrl(bucket, objectPath) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}

async function edge(functionName, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: "https://portal.maiprop.co",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

function expectEdgeSuccess(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed (${result.status}): ${bounded(result.body)}`);
  }
  return result.body?.data ?? result.body;
}

async function objectExists(bucket, objectPath) {
  const { error } = await admin.storage.from(bucket).download(objectPath);
  return !error;
}

async function registerAndUpload(bucket, objectPath, projectId) {
  const objectUrl = publicUrl(bucket, objectPath);
  const registration = await publicClient.rpc("register_new_building_storage_upload", {
    p_project_id: projectId,
    p_bucket: bucket,
    p_object_path: objectPath,
    p_object_url: objectUrl,
  });
  expectNoError(registration, `Register ${bucket}/${objectPath}`);

  const upload = await publicClient.storage.from(bucket).upload(
    objectPath,
    PNG_BYTES,
    { contentType: "image/png", upsert: false },
  );
  expectNoError(upload, `Upload ${bucket}/${objectPath}`);
  if (!(await objectExists(bucket, objectPath))) {
    throw new Error(`Uploaded object is not readable: ${bucket}/${objectPath}`);
  }
  return objectUrl;
}

async function readJob(bucket, objectPath) {
  const result = await admin
    .from("storage_cleanup_jobs")
    .select("id,status,attempts,completed_at,lease_token,lease_expires_at,next_attempt_at,last_error")
    .eq("bucket", bucket)
    .eq("object_path", objectPath)
    .maybeSingle();
  return expectNoError(result, `Read cleanup job for ${bucket}/${objectPath}`);
}

async function makeJobDue(
  bucket,
  objectPath,
  nextAttemptAt = new Date(Date.now() - 1_000).toISOString(),
) {
  const result = await admin
    .from("storage_cleanup_jobs")
    .update({
      status: "pending",
      next_attempt_at: nextAttemptAt,
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("bucket", bucket)
    .eq("object_path", objectPath);
  expectNoError(result, `Make cleanup job due for ${bucket}/${objectPath}`);
}

async function waitForJob(bucket, objectPath, predicate, label) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const row = await readJob(bucket, objectPath);
    if (row && predicate(row)) return row;
    await wait(300);
  }
  throw new Error(`Timed out waiting for ${label}: ${bucket}/${objectPath}`);
}

async function invokeCleanupWorker() {
  const invocation = await admin.rpc("invoke_storage_cleanup_cron");
  expectNoError(invocation, "Invoke Storage cleanup cron");
}

async function invokeCleanupWorkerWithSecret(secret) {
  return fetch(`${supabaseUrl}/functions/v1/process-storage-cleanup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
      "x-cron-secret": secret,
    },
    body: "{}",
  });
}

async function proveSuccessfulCreation() {
  const prefix = `${userId}/${ids.project}/create`;
  paths.cover = `${prefix}/cover.png`;
  paths.additional = `${prefix}/additional.png`;
  paths.projectMedia = `${prefix}/render.png`;

  const coverUrl = await registerAndUpload("listing-images", paths.cover, ids.project);
  const additionalUrl = await registerAndUpload(
    "listing-images",
    paths.additional,
    ids.project,
  );
  const projectMediaUrl = await registerAndUpload(
    "project-media",
    paths.projectMedia,
    ids.project,
  );
  record("authenticated pre-registration precedes exact-path uploads");

  const creation = expectEdgeSuccess(
    await edge("create-new-building-listing", {
      projectKind: "new_build",
      project: {
        id: ids.project,
        name: `ECAS Storage Proof ${runId}`,
        building_permit_number: `ECAS-${runId.slice(0, 8)}`,
        city: "Athens",
        address: "Storage proof staging address",
        latitude: 37.9838,
        longitude: 23.7275,
      },
      unit: {
        internal_sqm: 80,
        price: 240000,
      },
      projectMedia: [{
        url: projectMediaUrl,
        media_type: "rendering",
        title: "ECAS proof render",
      }],
      listing: {
        title: `ECAS Storage Proof ${runId}`,
        cover_image_url: coverUrl,
      },
      additionalImageUrls: [additionalUrl],
    }),
    "Atomic new-building creation",
  );
  if (creation.projectId !== ids.project || !creation.listingId) {
    throw new Error(`Unexpected creation result: ${bounded(creation)}`);
  }

  for (const [bucket, objectPath] of [
    ["listing-images", paths.cover],
    ["listing-images", paths.additional],
    ["project-media", paths.projectMedia],
  ]) {
    await waitForJob(
      bucket,
      objectPath,
      (row) => row.status === "completed" && Boolean(row.completed_at),
      "atomic Storage commitment",
    );
  }
  record("successful create atomically commits every registered object");
}

async function proveCommittedObjectPreservation() {
  await expectNoError(
    await publicClient.rpc("register_new_building_storage_upload", {
      p_project_id: ids.project,
      p_bucket: "listing-images",
      p_object_path: paths.cover,
      p_object_url: publicUrl("listing-images", paths.cover),
    }),
    "Re-register committed cover for preservation proof",
  );
  await makeJobDue("listing-images", paths.cover);
  await invokeCleanupWorker();
  await waitForJob(
    "listing-images",
    paths.cover,
    (row) => row.status === "completed" && Boolean(row.completed_at),
    "committed object preservation",
  );
  if (!(await objectExists("listing-images", paths.cover))) {
    throw new Error("Cleanup worker deleted a committed listing cover");
  }
  record("cleanup worker preserves objects still referenced by committed catalogue rows");
}

async function proveProcessingRaceAndExactDeletion() {
  paths.race = `${userId}/${ids.raceProject}/create/race.png`;
  await registerAndUpload("listing-images", paths.race, ids.raceProject);
  await makeJobDue(
    "listing-images",
    paths.race,
    "2000-01-01T00:00:00.000Z",
  );

  const claim = await admin.rpc("claim_storage_cleanup_jobs", { p_limit: 1 });
  const claimed = expectNoError(claim, "Claim race cleanup job") ?? [];
  const raceJob = claimed.find((row) => row.object_path === paths.race);
  if (!raceJob?.lease_token) {
    throw new Error(`Race cleanup job was not claimed: ${bounded(claimed)}`);
  }

  const blockedRegistration = await publicClient.rpc(
    "register_new_building_storage_upload",
    {
      p_project_id: ids.raceProject,
      p_bucket: "listing-images",
      p_object_path: paths.race,
      p_object_url: publicUrl("listing-images", paths.race),
    },
  );
  if (!blockedRegistration.error?.message?.includes("storage_cleanup_in_progress")) {
    throw new Error(
      `Processing cleanup did not block recommit: ${bounded(blockedRegistration)}`,
    );
  }
  record("processing lease blocks upload recommit races");

  const expireFirstLease = await admin
    .from("storage_cleanup_jobs")
    .update({
      lease_expires_at: "2000-01-01T00:00:00.000Z",
      updated_at: new Date().toISOString(),
    })
    .eq("id", raceJob.id)
    .eq("lease_token", raceJob.lease_token);
  expectNoError(expireFirstLease, "Expire first race proof lease");

  const reclaim = await admin.rpc("claim_storage_cleanup_jobs", { p_limit: 1 });
  const reclaimed = expectNoError(reclaim, "Reclaim expired race cleanup job") ?? [];
  const reclaimedJob = reclaimed.find((row) => row.id === raceJob.id);
  if (
    !reclaimedJob?.lease_token
    || reclaimedJob.lease_token === raceJob.lease_token
  ) {
    throw new Error(`Race cleanup job was not reclaimed: ${bounded(reclaimed)}`);
  }

  const stalePrepare = expectNoError(
    await admin.rpc("prepare_storage_cleanup_delete", {
      p_job_id: raceJob.id,
      p_lease_token: raceJob.lease_token,
    }),
    "Attempt cleanup with stale lease token",
  );
  if (stalePrepare !== "lost") {
    throw new Error(`Stale cleanup lease remained valid: ${bounded(stalePrepare)}`);
  }
  record("stale lease tokens cannot finalize a reclaimed job");

  const expireReclaimedLease = await admin
    .from("storage_cleanup_jobs")
    .update({
      lease_expires_at: "2000-01-01T00:00:00.000Z",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reclaimedJob.id)
    .eq("lease_token", reclaimedJob.lease_token);
  expectNoError(expireReclaimedLease, "Expire reclaimed race proof lease");

  await invokeCleanupWorker();
  await waitForJob(
    "listing-images",
    paths.race,
    (row) => row.status === "completed",
    "race object cleanup",
  );
  if (await objectExists("listing-images", paths.race)) {
    throw new Error("Cleanup worker did not remove the exact uncommitted race object");
  }
  record("cleanup worker deletes the exact uncommitted leased path");
}

async function proveAbandonedUploadCleanup() {
  paths.abandoned = `${userId}/${ids.abandonedProject}/create/abandoned.png`;
  await registerAndUpload("project-media", paths.abandoned, ids.abandonedProject);
  await makeJobDue("project-media", paths.abandoned);

  const beforeWrongSecret = await readJob("project-media", paths.abandoned);
  const wrongSecretResponse = await invokeCleanupWorkerWithSecret(
    `wrong-cron-secret-${runId}`,
  );
  if (wrongSecretResponse.status !== 401) {
    throw new Error(
      `Wrong cleanup secret returned ${wrongSecretResponse.status} instead of 401`,
    );
  }
  const afterWrongSecret = await readJob("project-media", paths.abandoned);
  for (const field of ["id", "status", "attempts", "lease_token", "lease_expires_at"]) {
    if (beforeWrongSecret?.[field] !== afterWrongSecret?.[field]) {
      throw new Error(`Wrong cleanup secret mutated job field ${field}`);
    }
  }
  if (!(await objectExists("project-media", paths.abandoned))) {
    throw new Error("Wrong cleanup secret deleted the proof object");
  }
  record("wrong secret leaves the cleanup job and object unchanged");

  await invokeCleanupWorker();
  await waitForJob(
    "project-media",
    paths.abandoned,
    (row) => row.status === "completed",
    "abandoned upload cleanup",
  );
  if (await objectExists("project-media", paths.abandoned)) {
    throw new Error("Abandoned project-media upload survived cleanup");
  }
  record("abandoned pre-registered upload becomes eligible and is deleted");
}

async function proveDeadJobRequeue() {
  paths.dead = `${userId}/${ids.deadProject}/create/dead.png`;
  await registerAndUpload("project-media", paths.dead, ids.deadProject);
  const registeredJob = await readJob("project-media", paths.dead);
  if (!registeredJob?.id) {
    throw new Error("Dead-job proof registration did not create a cleanup job");
  }

  const markDead = await admin
    .from("storage_cleanup_jobs")
    .update({
      status: "dead",
      attempts: 10,
      last_error: "staging proof synthetic terminal failure",
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", registeredJob.id);
  expectNoError(markDead, "Mark proof cleanup job dead");

  const requeued = expectNoError(
    await admin.rpc("requeue_storage_cleanup_job", {
      p_job_id: registeredJob.id,
    }),
    "Requeue dead cleanup job",
  );
  if (requeued !== true) {
    throw new Error(`Dead cleanup job was not requeued: ${bounded(requeued)}`);
  }
  const pendingJob = await readJob("project-media", paths.dead);
  if (pendingJob?.status !== "pending" || pendingJob.attempts !== 0) {
    throw new Error(`Requeued cleanup job is invalid: ${bounded(pendingJob)}`);
  }

  await makeJobDue("project-media", paths.dead);
  await invokeCleanupWorker();
  await waitForJob(
    "project-media",
    paths.dead,
    (row) => row.status === "completed",
    "requeued dead object cleanup",
  );
  if (await objectExists("project-media", paths.dead)) {
    throw new Error("Requeued dead cleanup job did not delete its exact object");
  }
  record("dead cleanup jobs can be requeued and completed");
}

async function proveProjectDeletionScope() {
  expectEdgeSuccess(
    await edge("project-management", {
      action: "delete_project",
      id: ids.project,
    }),
    "Project deletion",
  );
  await invokeCleanupWorker();
  await waitForJob(
    "project-media",
    paths.projectMedia,
    (row) => row.status === "completed",
    "deleted project media cleanup",
  );
  if (await objectExists("project-media", paths.projectMedia)) {
    throw new Error("Deleted project media was not removed");
  }
  for (const objectPath of [paths.cover, paths.additional]) {
    if (!(await objectExists("listing-images", objectPath))) {
      throw new Error(`Project deletion removed listing image ${objectPath}`);
    }
  }
  record("project deletion removes project-media without prefix-deleting listing-images");
}

async function cleanup() {
  for (const [bucket, objectPath] of [
    ["listing-images", paths.cover],
    ["listing-images", paths.additional],
    ["listing-images", paths.race],
    ["project-media", paths.projectMedia],
    ["project-media", paths.abandoned],
    ["project-media", paths.dead],
  ]) {
    if (!objectPath) continue;
    const removal = await admin.storage.from(bucket).remove([objectPath]);
    if (removal.error) {
      cleanupErrors.push(`Storage ${bucket}/${objectPath}: ${bounded(removal.error)}`);
    }
  }

  if (userId) {
    const jobDelete = await admin
      .from("storage_cleanup_jobs")
      .delete()
      .eq("owner_id", userId);
    if (jobDelete.error) cleanupErrors.push(`Cleanup jobs: ${bounded(jobDelete.error)}`);

    for (const projectId of Object.values(ids)) {
      const projectDelete = await admin.from("projects").delete().eq("id", projectId);
      if (projectDelete.error) {
        cleanupErrors.push(`Project ${projectId}: ${bounded(projectDelete.error)}`);
      }
    }

    const userDelete = await admin.auth.admin.deleteUser(userId);
    if (userDelete.error) cleanupErrors.push(`Auth user: ${bounded(userDelete.error)}`);
  }
}

async function assertZeroResidue() {
  if (!userId) return;
  const jobs = await admin
    .from("storage_cleanup_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  expectNoError(jobs, "Verify cleanup job teardown");
  if ((jobs.count ?? 0) !== 0) {
    throw new Error(`Storage proof left ${jobs.count} cleanup jobs`);
  }
  for (const [bucket, objectPath] of [
    ["listing-images", paths.cover],
    ["listing-images", paths.additional],
    ["listing-images", paths.race],
    ["project-media", paths.projectMedia],
    ["project-media", paths.abandoned],
    ["project-media", paths.dead],
  ]) {
    if (objectPath && await objectExists(bucket, objectPath)) {
      throw new Error(`Storage proof left object ${bucket}/${objectPath}`);
    }
  }
}

let mainError = null;
try {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { ecas_fixture: true, ecas_run_id: runId },
  });
  userId = expectNoError(created, "Create disposable staging developer").user.id;

  const onboarding = await admin.rpc("complete_onboarding_role_for_user", {
    p_user_id: userId,
    p_role: "developer",
    p_participant_type: "developer",
    p_display_name: `ECAS Storage ${runId.slice(0, 8)}`,
    p_city: "Athens",
  });
  expectNoError(onboarding, "Complete disposable developer onboarding");

  const profile = await admin
    .from("profiles")
    .update({
      force_pro_access: true,
      account_status: "active",
    }).eq("user_id", userId);
  expectNoError(profile, "Provision disposable developer profile");

  const signedIn = await publicClient.auth.signInWithPassword({ email, password });
  accessToken = expectNoError(signedIn, "Sign in disposable developer").session.access_token;
  record("disposable Developer Pro identity authenticated with a real JWT");

  await proveSuccessfulCreation();
  await proveCommittedObjectPreservation();
  await proveProcessingRaceAndExactDeletion();
  await proveAbandonedUploadCleanup();
  await proveDeadJobRequeue();
  await proveProjectDeletionScope();
} catch (error) {
  mainError = error;
} finally {
  try {
    await cleanup();
    await assertZeroResidue();
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
  throw new Error(
    `run_id=${runId}; main_error=${mainDetail}; cleanup_errors=${cleanupErrors.join("; ") || "none"}`,
  );
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  run_id: runId,
  target: projectRef,
  evidence,
  teardown: "zero residue",
}, null, 2)}\n`);
