import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_URL = "https://properties.maiprop.co";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function brandWrap(innerHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:0;">
    <!-- Header -->
    <div style="background:#000014;padding:28px 0;text-align:center;border-radius:8px 8px 0 0;">
      <img src="https://cqxcztafhnwkhxgaylne.supabase.co/storage/v1/object/public/email-assets/logo-new.png" alt="mAI Prop" width="180" style="display:block;margin:0 auto;" />
    </div>

    <!-- Body -->
    <div style="background:#faf6f0;padding:32px 30px;border-radius:0 0 8px 8px;">
      ${innerHtml}
    </div>

    <!-- CTA -->
    <div style="text-align:center;padding:30px 0;">
      <a href="${SITE_URL}/#opportunities" style="display:inline-block;background:#4ef5f1;color:#000014;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;text-decoration:none;">
        Browse Our Portfolio →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:0 0 20px;">
      <p style="margin:0 0 8px;font-size:12px;color:#888;">
        You received this because you submitted an inquiry on our platform.
      </p>
      <p style="margin:0;font-size:12px;color:#666;">
        © ${new Date().getFullYear()} mAI Prop · <a href="${SITE_URL}" style="color:#8755f2;text-decoration:none;">properties.maiprop.co</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function generateLeadEmail(lead: any): Promise<{ subject: string; body: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not configured, using fallback email");
    return {
      subject: `Welcome to mAI Prop — Your Golden Visa Journey Starts Here`,
      body: brandWrap(getFallbackInnerHtml(lead)),
    };
  }

  try {
    const prompt = `You are mAI Prop's investment assistant. Write a SHORT welcome email (max 8 lines total) for a new Golden Visa lead.

Lead: ${escapeHtml(lead.full_name)}, ${escapeHtml(lead.nationality)}, budget €${Number(lead.investment_budget).toLocaleString()}, prefers ${escapeHtml(lead.preferred_location || "Greece")}, interested in ${escapeHtml(lead.property_type || "properties")}, timeline: ${escapeHtml(lead.investment_timeline || "flexible")}.

Format rules — follow EXACTLY:
1. One greeting line addressing them by first name (e.g. "Hi Kostis,")
2. One sentence acknowledging their interest
3. A bullet list (3-4 bullets) of what we offer, focusing on our property inventory:
   • Visa-eligible apartments from €250K
   • Pre-verified properties in Athens & Thessaloniki  
   • Full legal, renovation & rental management
   • 3%+ annual returns with proven track record
4. One closing sentence: advisor will reach out within 24 hours
5. Sign off: "The mAI Prop Team"

Use bullet character • for list items. Do NOT use markdown. Plain text only. Keep it punchy.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You write ultra-concise, professional emails for a luxury real estate firm. Output only the email body. No subject line. No markdown.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return { subject: `Welcome to mAI Prop — Your Golden Visa Journey`, body: brandWrap(getFallbackInnerHtml(lead)) };
    }

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content?.trim() || "";

    if (!aiText) {
      return { subject: `Welcome to mAI Prop — Your Golden Visa Journey`, body: brandWrap(getFallbackInnerHtml(lead)) };
    }

    // Convert bullet lines to styled HTML
    const htmlContent = escapeHtml(aiText)
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("•")) {
          return `<div style="padding:4px 0 4px 16px;position:relative;color:#3d3529;font-size:15px;line-height:1.7;"><span style="color:#0a0e2a;font-weight:bold;position:absolute;left:0;">•</span>${trimmed.slice(1).trim()}</div>`;
        }
        if (!trimmed) return "<br/>";
        return `<p style="margin:0 0 10px;color:#3d3529;font-size:15px;line-height:1.7;">${trimmed}</p>`;
      })
      .join("");

    const firstName = escapeHtml(lead.full_name.split(" ")[0]);
    const subject = `${firstName}, your Golden Visa portfolio is ready — mAI Prop`;

    return { subject, body: brandWrap(htmlContent) };
  } catch (e) {
    console.error("AI email generation failed:", e);
    return { subject: `Welcome to mAI Prop — Your Golden Visa Journey`, body: brandWrap(getFallbackInnerHtml(lead)) };
  }
}

function getFallbackInnerHtml(lead: any): string {
  const firstName = escapeHtml(lead.full_name.split(" ")[0]);
  return `
    <p style="margin:0 0 10px;color:#3d3529;font-size:15px;line-height:1.7;">Hi ${firstName},</p>
    <p style="margin:0 0 12px;color:#3d3529;font-size:15px;line-height:1.7;">Thank you for your interest in the Greek Golden Visa. Here's what we have ready for you:</p>
    <div style="padding:4px 0 4px 16px;position:relative;color:#3d3529;font-size:15px;line-height:1.7;"><span style="color:#0a0e2a;font-weight:bold;position:absolute;left:0;">•</span>Visa-eligible apartments & villas from €250K</div>
    <div style="padding:4px 0 4px 16px;position:relative;color:#3d3529;font-size:15px;line-height:1.7;"><span style="color:#0a0e2a;font-weight:bold;position:absolute;left:0;">•</span>Pre-verified properties in Athens, Thessaloniki & the islands</div>
    <div style="padding:4px 0 4px 16px;position:relative;color:#3d3529;font-size:15px;line-height:1.7;"><span style="color:#0a0e2a;font-weight:bold;position:absolute;left:0;">•</span>Full legal, renovation & rental management</div>
    <div style="padding:4px 0 4px 16px;position:relative;color:#3d3529;font-size:15px;line-height:1.7;"><span style="color:#0a0e2a;font-weight:bold;position:absolute;left:0;">•</span>8%+ annual returns with a proven track record</div>
    <p style="margin:12px 0 10px;color:#3d3529;font-size:15px;line-height:1.7;">A dedicated advisor will reach out within 24 hours.</p>
    <p style="margin:0;color:#3d3529;font-size:15px;line-height:1.7;">Warm regards,<br/>The mAI Prop Team</p>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Accept lead_id, email lookup, or full lead object
    let lead: any;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (body.lead_id && typeof body.lead_id === "string") {
      const { data: dbLead, error } = await supabase.from("leads").select("*").eq("id", body.lead_id).single();
      if (error || !dbLead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      lead = dbLead;
    } else if (body.email && typeof body.email === "string") {
      const { data: dbLead, error } = await supabase
        .from("leads")
        .select("*")
        .eq("email", body.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !dbLead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      lead = dbLead;
    } else if (body.full_name && body.email) {
      lead = body;
      if (typeof lead.full_name !== "string" || lead.full_name.length > 100) {
        return new Response(JSON.stringify({ error: "Invalid name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof lead.email !== "string" || lead.email.length > 255) {
        return new Response(JSON.stringify({ error: "Invalid email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof lead.phone !== "string" || lead.phone.length > 20) {
        return new Response(JSON.stringify({ error: "Invalid phone" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Missing lead_id, email, or lead data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const NOTIFY_EMAIL = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");
    const results = { email_sent: false, telegram_sent: false, lead_email_sent: false };

    const BREVO_API_KEY = Deno.env.get("brevo");

    // ---- AI-Powered Welcome Email to Lead ----
    if (BREVO_API_KEY && lead.email) {
      try {
        const { subject, body: emailBody } = await generateLeadEmail(lead);
        const leadEmailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender: { name: "mAI Prop", email: "kr@maiprop.co" },
            to: [{ email: lead.email, name: lead.full_name }],
            subject,
            htmlContent: emailBody,
          }),
        });
        const leadEmailData = await leadEmailRes.json();
        results.lead_email_sent = leadEmailRes.ok;
        if (!leadEmailRes.ok) console.error("Lead email error:", JSON.stringify(leadEmailData));
      } catch (e) {
        console.error("Lead email failed:", e);
      }
    }

    // ---- Admin Notification Email via Brevo ----
    if (BREVO_API_KEY && NOTIFY_EMAIL) {
      const emailHtml = `
        <h2 style="color:#4ef5f1;font-size:20px;font-weight:bold;margin:0 0 16px;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;">🔔 New Lead Received</h2>
        <table style="border-collapse:collapse;width:100%;">
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;border-bottom:1px solid rgba(78,245,241,0.15);">Name</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;border-bottom:1px solid rgba(78,245,241,0.15);">${escapeHtml(lead.full_name)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;border-bottom:1px solid rgba(78,245,241,0.15);">Phone</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;border-bottom:1px solid rgba(78,245,241,0.15);">${escapeHtml(lead.phone)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;border-bottom:1px solid rgba(78,245,241,0.15);">Email</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;border-bottom:1px solid rgba(78,245,241,0.15);">${escapeHtml(lead.email)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;border-bottom:1px solid rgba(78,245,241,0.15);">Nationality</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;border-bottom:1px solid rgba(78,245,241,0.15);">${escapeHtml(lead.nationality)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;border-bottom:1px solid rgba(78,245,241,0.15);">Budget</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;border-bottom:1px solid rgba(78,245,241,0.15);">€${Number(lead.investment_budget).toLocaleString()}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;border-bottom:1px solid rgba(78,245,241,0.15);">Location</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;border-bottom:1px solid rgba(78,245,241,0.15);">${escapeHtml(lead.preferred_location || "—")}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;border-bottom:1px solid rgba(78,245,241,0.15);">Type</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;border-bottom:1px solid rgba(78,245,241,0.15);">${escapeHtml(lead.property_type || "—")}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:600;color:#4ef5f1;font-size:13px;">Timeline</td><td style="padding:8px 12px;color:#e0fafa;font-size:14px;">${escapeHtml(lead.investment_timeline || "—")}</td></tr>
        </table>
      `;

      try {
        const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender: { name: "mAI Prop", email: "kr@maiprop.co" },
            to: [{ email: NOTIFY_EMAIL }],
            subject: `🏠 New Lead: ${escapeHtml(lead.full_name)} — €${Number(lead.investment_budget).toLocaleString()}`,
            htmlContent: emailHtml,
          }),
        });
        const emailData = await emailRes.json();
        results.email_sent = emailRes.ok;
        if (!emailRes.ok) console.error("Brevo error:", JSON.stringify(emailData));
      } catch (e) {
        console.error("Email send failed:", e);
      }
    }

    // ---- Telegram Bot ----
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const telegramText = [
        `🔔 *New Lead Alert*`,
        ``,
        `*Name:* ${lead.full_name}`,
        `*Phone:* ${lead.phone}`,
        `*Email:* ${lead.email}`,
        `*Nationality:* ${lead.nationality}`,
        `*Budget:* €${Number(lead.investment_budget).toLocaleString()}`,
        `*Location:* ${lead.preferred_location || "—"}`,
        `*Type:* ${lead.property_type || "—"}`,
        `*Timeline:* ${lead.investment_timeline || "—"}`,
      ].join("\n");

      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: telegramText,
            parse_mode: "Markdown",
          }),
        });
        const tgData = await tgRes.json();
        results.telegram_sent = tgData.ok === true;
        if (!tgData.ok) console.error("Telegram error:", JSON.stringify(tgData));
      } catch (e) {
        console.error("Telegram send failed:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Notification error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
