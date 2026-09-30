import { createClient } from "npm:@supabase/supabase-js@2";
import { finishScheduledDispatch, startScheduledDispatch, type ScheduledOutcome, type ScheduledSummary, type ScheduledRun } from "../_shared/scheduledDispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Schedule: step 1 at 1 day after welcome, step 2 at 7 days after step 1 (8 days total), step 3 at 21 days after step 2 (29 days total)
const SCHEDULE = [
  { step: 1, daysAfter: 1 },
  { step: 2, daysAfter: 8 },
  { step: 3, daysAfter: 29 },
];
const requireEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Cron secret guard: reject unauthenticated external triggers ──────────
  {
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  let traceClient: ReturnType<typeof createClient> | null = null;
  let traceRun: ScheduledRun | null = null;
  const results: { step: number; success: boolean; error?: string }[] = [];
  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);
    traceClient = supabase;
    const trace = await startScheduledDispatch(supabase, req, "scheduled_followups", corsHeaders);
    if (trace.response) return trace.response;
    const run = trace.run!;
    traceRun = run;
    const terminal = (response: Response, outcome: ScheduledOutcome, summary: ScheduledSummary) =>
      finishScheduledDispatch(supabase, run, response, outcome, summary);

    const now = new Date();

    // Fetch all non-closed marketing leads that haven't completed all 3 followups.
    // The generic CRM `leads` table does not have `full_name` or `followup_step`.
    const { data: leads, error } = await supabase
      .from("marketing_leads")
      .select("id, full_name, email, created_at, followup_step, status")
      .neq("status", "closed")
      .lt("followup_step", 3)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch leads:", error);
      return await terminal(new Response(JSON.stringify({ error: "Failed to fetch leads" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }), "failed", { processed: 0, succeeded: 0, failed: 0 });
    }

    if (!leads || leads.length === 0) {
      return await terminal(new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: "No leads need followup",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      ), "skipped", { processed: 0, succeeded: 0, failed: 0 });
    }

    for (const lead of leads) {
      const createdAt = new Date(lead.created_at);
      const daysSinceCreation = (now.getTime() - createdAt.getTime()) /
        (1000 * 60 * 60 * 24);
      const currentStep = lead.followup_step || 0;

      // Find the next step that should be sent based on timing
      const nextSchedule = SCHEDULE.find(
        (s) => s.step === currentStep + 1 && daysSinceCreation >= s.daysAfter,
      );

      if (!nextSchedule) continue;

      // Call the followup-lead function internally
      try {
        const followupRes = await fetch(
          `${supabaseUrl}/functions/v1/followup-lead`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              lead_id: lead.id,
              step: nextSchedule.step,
            }),
          },
        );

        const followupData = await followupRes.json();
        const complete = followupRes.ok && followupData?.success === true &&
          followupData.preview !== true &&
          (followupData.provider_accepted === undefined || followupData.provider_accepted === true) &&
          (followupData.persistence_complete === undefined || followupData.persistence_complete === true) &&
          (followupData.outcome === undefined || followupData.outcome === "succeeded");
        results.push({
          step: nextSchedule.step,
          success: complete,
          error: complete ? undefined : "followup_incomplete",
        });

        console.log(
          `Followup step ${nextSchedule.step}: ${complete ? "OK" : "FAILED"}`,
        );
      } catch {
        console.error("Followup child result unavailable");
        results.push({
          step: nextSchedule.step,
          success: false,
          error: "followup_result_unknown",
        });
      }
    }

    const failed = results.filter((r) => !r.success).length;
    return await terminal(new Response(
      JSON.stringify({
        success: failed === 0,
        outcome: failed === 0 ? "succeeded" : "partial",
        processed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed,
      }),
      {
        status: failed === 0 ? 200 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    ), failed === 0 ? "succeeded" : "partial", {
      processed: results.length, succeeded: results.length - failed, failed,
    });
  } catch (error: unknown) {
    console.error("Scheduled followup error:", error);
    const succeeded = results.filter((result) => result.success).length;
    const failed = results.length - succeeded;
    const outcome = succeeded > 0 ? "partial" : "failed";
    const response = new Response(JSON.stringify({
      error: "Internal error", success: false, outcome,
      processed: results.length, succeeded, failed,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    return traceClient && traceRun
      ? await finishScheduledDispatch(traceClient, traceRun, response, outcome, { processed: results.length, succeeded, failed })
      : new Response(JSON.stringify({
        error: "Internal error", success: false, outcome,
        processed: results.length, succeeded, failed,
        dispatch_id: null, trace_persistence_complete: false,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }
});
