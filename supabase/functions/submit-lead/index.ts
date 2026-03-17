import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { lead, turnstileToken } = body;

    // ── 1. Require Turnstile token ───────────────────────────────────────────
    if (!turnstileToken || typeof turnstileToken !== "string") {
      return new Response(JSON.stringify({ error: "CAPTCHA verification required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Verify Turnstile token with Cloudflare ────────────────────────────
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secret) {
      return new Response(JSON.stringify({ error: "CAPTCHA not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", turnstileToken);
    // Optionally bind to remote IP for extra security
    const clientIp = req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for");
    if (clientIp) formData.append("remoteip", clientIp);

    const verifyRes = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: formData });
    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      console.warn("Turnstile failed:", verifyData["error-codes"]);
      return new Response(JSON.stringify({ error: "CAPTCHA verification failed. Please try again." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Validate lead payload ─────────────────────────────────────────────
    if (
      !lead ||
      typeof lead.full_name !== "string" || lead.full_name.trim().length < 2 || lead.full_name.trim().length > 200 ||
      typeof lead.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim()) || lead.email.trim().length > 254 ||
      typeof lead.phone !== "string" || !/^\+?[\d\s\-()]{5,30}$/.test(lead.phone.trim()) ||
      typeof lead.nationality !== "string" || lead.nationality.trim().length < 1 || lead.nationality.trim().length > 100 ||
      typeof lead.investment_budget !== "number" || lead.investment_budget < 0
    ) {
      return new Response(JSON.stringify({ error: "Invalid lead data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Insert lead via service role ──────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: insertError } = await supabase.from("leads").insert({
      full_name: lead.full_name.trim(),
      phone: lead.phone.trim(),
      email: lead.email.trim().toLowerCase(),
      nationality: lead.nationality.trim(),
      investment_budget: lead.investment_budget,
      preferred_location: (lead.preferred_location || "").trim().slice(0, 100),
      property_type: (lead.property_type || "").slice(0, 50),
      investment_timeline: (lead.investment_timeline || "").slice(0, 50),
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save lead" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("submit-lead error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
