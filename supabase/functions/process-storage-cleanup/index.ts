import { createClient } from "npm:@supabase/supabase-js@2.57.2";

type CleanupJob = {
  id: string;
  bucket: "listing-images" | "project-media";
  object_path: string;
  attempts: number;
  lease_token: string;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? "unknown_error");

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Service unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("claim_storage_cleanup_jobs", {
    p_limit: 25,
  });
  if (error) {
    console.error("Storage cleanup claim failed", error);
    return jsonResponse({ error: "Cleanup queue unavailable" }, 500);
  }

  const jobs = (data ?? []) as CleanupJob[];
  let completed = 0;
  let retried = 0;
  let dead = 0;

  for (const job of jobs) {
    try {
      if (!job.lease_token) throw new Error("cleanup_lease_missing");
      const { data: disposition, error: prepareError } = await supabase.rpc(
        "prepare_storage_cleanup_delete",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
        },
      );
      if (prepareError) throw prepareError;

      if (disposition === "lost") {
        continue;
      }
      if (disposition === "preserve") {
        completed += 1;
        continue;
      }
      if (disposition !== "delete") {
        throw new Error("cleanup_prepare_result_invalid");
      }

      const { error: removeError } = await supabase.storage
        .from(job.bucket)
        .remove([job.object_path]);
      if (removeError) throw removeError;

      const now = new Date().toISOString();
      const { data: updatedRows, error: updateError } = await supabase
        .from("storage_cleanup_jobs")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now,
          last_error: null,
          lease_token: null,
          lease_expires_at: null,
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("lease_token", job.lease_token)
        .select("id");
      if (updateError) throw updateError;
      if (updatedRows?.length !== 1) {
        throw new Error("cleanup_lease_lost_after_delete");
      }
      completed += 1;
    } catch (jobError) {
      const terminal = job.attempts >= 10;
      const delayMinutes = Math.min(360, 2 ** Math.min(job.attempts, 8));
      const nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
      const { data: updatedRows, error: updateError } = await supabase
        .from("storage_cleanup_jobs")
        .update({
          status: terminal ? "dead" : "pending",
          next_attempt_at: nextAttemptAt,
          updated_at: new Date().toISOString(),
          last_error: errorMessage(jobError).slice(0, 1000),
          lease_token: null,
          lease_expires_at: null,
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("lease_token", job.lease_token)
        .select("id");
      if (updateError) {
        console.error("Storage cleanup retry state update failed", {
          jobId: job.id,
          error: errorMessage(updateError),
        });
      } else if (updatedRows?.length === 1) {
        if (terminal) dead += 1;
        else retried += 1;
      }
    }
  }

  return jsonResponse({
    claimed: jobs.length,
    completed,
    retried,
    dead,
  }, dead > 0 ? 500 : 200);
});
