import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const results: { lead_id: string; step: number; success: boolean; error?: string }[] = [];

    // Fetch all non-closed leads that haven't completed all 3 followups
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, full_name, email, created_at, followup_step, status")
      .neq("status", "closed")
      .lt("followup_step", 3)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch leads:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch leads" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No leads need followup" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const lead of leads) {
      const createdAt = new Date(lead.created_at);
      const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const currentStep = lead.followup_step || 0;

      // Find the next step that should be sent based on timing
      const nextSchedule = SCHEDULE.find(
        (s) => s.step === currentStep + 1 && daysSinceCreation >= s.daysAfter
      );

      if (!nextSchedule) continue;

      // Call the followup-lead function internally
      try {
        const followupRes = await fetch(`${supabaseUrl}/functions/v1/followup-lead`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lead_id: lead.id,
            step: nextSchedule.step,
          }),
        });

        const followupData = await followupRes.json();
        results.push({
          lead_id: lead.id,
          step: nextSchedule.step,
          success: followupRes.ok,
          error: followupRes.ok ? undefined : followupData.error,
        });

        console.log(
          `Followup step ${nextSchedule.step} for ${lead.full_name}: ${followupRes.ok ? "OK" : "FAILED"}`
        );
      } catch (e) {
        console.error(`Failed to send followup to ${lead.full_name}:`, e);
        results.push({
          lead_id: lead.id,
          step: nextSchedule.step,
          success: false,
          error: String(e),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Scheduled followup error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
