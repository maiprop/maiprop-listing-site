import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_URL = "https://properties.maiprop.co";

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead, customMessage, preview_only } = await req.json();

    // Validate lead has an id
    if (!lead?.id || typeof lead.id !== "string") {
      return new Response(JSON.stringify({ error: "Missing lead id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate customMessage length
    if (customMessage && (typeof customMessage !== "string" || customMessage.length > 5000)) {
      return new Response(JSON.stringify({ error: "Message too long (max 5000 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead from database instead of trusting client data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: dbLead, error: dbError } = await supabase.from("leads").select("*").eq("id", lead.id).single();

    if (dbError || !dbLead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const BREVO_API_KEY = Deno.env.get("brevo");
    if (!BREVO_API_KEY && !preview_only) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const firstName = escapeHtml(dbLead.full_name.split(" ")[0]);

    let subject: string;
    let htmlBody: string;

    if (customMessage) {
      // Admin wrote a custom message — wrap it in the branded template
      const htmlContent = escapeHtml(customMessage)
        .split("\n")
        .map((line: string) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("•")) {
            return `<div style="padding:4px 0 4px 16px;position:relative;color:#3d3529;font-size:15px;line-height:1.7;"><span style="color:#0a0e2a;font-weight:bold;position:absolute;left:0;">•</span>${trimmed.slice(1).trim()}</div>`;
          }
          if (!trimmed) return "<br/>";
          return `<p style="margin:0 0 10px;color:#3d3529;font-size:15px;line-height:1.7;">${trimmed}</p>`;
        })
        .join("");
      subject = `${firstName}, a message from mAI Prop`;
      htmlBody = brandWrap(htmlContent);
    } else {
      // Auto-generate a follow-up email using AI
      if (LOVABLE_API_KEY) {
        try {
          // Fetch available properties matching budget or location
          const budget = Number(dbLead.investment_budget) || 250000;
          const location = (dbLead.preferred_location || "").toLowerCase();

          const { data: matchingProps } = await supabase
            .from("properties")
            .select("id, title, location, price, size, bedrooms, yield, project_type, images")
            .eq("status", "available")
            .lte("price", budget * 1.2)
            .order("price", { ascending: false })
            .limit(6);

          const { data: locationProps } = location
            ? await supabase
                .from("properties")
                .select("id, title, location, price, size, bedrooms, yield, project_type, images")
                .eq("status", "available")
                .ilike("location", `%${location}%`)
                .limit(4)
            : { data: [] };

          // Merge and deduplicate
          const allProps = matchingProps || [];
          const locIds = new Set(allProps.map((p: any) => p.title + p.price));
          for (const p of locationProps || []) {
            if (!locIds.has(p.title + p.price)) allProps.push(p);
          }

          // Pick top 3-4 properties
          const topProps = allProps.slice(0, 4);

          // Build property link & image helpers
          const propertyLink = (id: string) => `${SITE_URL}/#property-${id}`;
          // Use full public URL for images (not render/image which may not work in email clients)
          const propertyImage = (p: any) => {
            const imgs = p.images || [];
            if (imgs.length === 0) return "";
            // Ensure we use the direct public URL
            return imgs[0];
          };

          const propertySummary =
            topProps.length > 0
              ? topProps
                  .map(
                    (p: any) =>
                      `- ${p.title} in ${p.location}: €${Number(p.price).toLocaleString()}, ${p.size}m², ${p.bedrooms} bed${p.bedrooms > 1 ? "s" : ""}${p.yield ? `, ${p.yield} yield` : ""}`,
                  )
                  .join("\n")
              : "- Visa-eligible apartments & villas from €250K in Athens & islands";

          // Build property cards HTML
          const propertyCardsHtml =
            topProps.length > 0
              ? topProps
                  .map((p: any) => {
                    const img = propertyImage(p);
                    const link = propertyLink(p.id);
                    const priceStr = p.price ? `€${Number(p.price).toLocaleString()}` : "";
                    const details = [
                      p.size ? `${p.size}m²` : "",
                      p.bedrooms ? `${p.bedrooms} bed${p.bedrooms > 1 ? "s" : ""}` : "",
                      p.yield || "",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return `
                  <a href="${link}" style="display:block;text-decoration:none;margin:12px 0;border-radius:8px;overflow:hidden;border:1px solid #1a1e3a;">
                    ${img ? `<img src="${img}" alt="${escapeHtml(p.title)}" width="460" style="display:block;width:100%;max-height:180px;object-fit:cover;" />` : ""}
                    <div style="padding:14px 16px;background:#0f1340;">
                      <p style="margin:0 0 4px;color:#4ef5f1;font-size:15px;font-weight:600;">${escapeHtml(p.title)}</p>
                      <p style="margin:0 0 4px;color:#e0fafa;font-size:13px;">${escapeHtml(p.location)} ${priceStr ? `— ${priceStr}` : ""}</p>
                      ${details ? `<p style="margin:0;color:#a0b0c0;font-size:12px;">${details}</p>` : ""}
                    </div>
                  </a>`;
                  })
                  .join("")
              : "";

          const prompt = `You are mAI Prop's investment advisor. Write a warm, concise follow-up email (max 8 lines) for a Golden Visa lead.

Lead: ${escapeHtml(dbLead.full_name)}, ${escapeHtml(dbLead.nationality)}, budget €${Number(dbLead.investment_budget).toLocaleString()}, prefers ${escapeHtml(dbLead.preferred_location || "Greece")}, interested in ${escapeHtml(dbLead.property_type || "properties")}, timeline: ${escapeHtml(dbLead.investment_timeline || "flexible")}.

Format rules — follow EXACTLY:
1. One greeting line addressing them by first name
2. One short sentence: we reviewed their profile and found matching opportunities
3. A brief sentence teasing that we've hand-picked properties for them below (do NOT mention specific property names, prices, or sizes — the property cards will appear below this text)
4. One sentence about our end-to-end services (legal support, renovation, rental management)
5. One closing sentence inviting them to schedule a call
6. Sign off: "The mAI Prop Team"

Do NOT mention specific property details (names, prices, sizes, yields). The properties will be shown visually below your text with images and links.
Do NOT use markdown or bullet lists. Plain text only. Keep it professional and warm.`;

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

          if (response.ok) {
            const data = await response.json();
            const aiText = data.choices?.[0]?.message?.content?.trim() || "";
            if (aiText) {
              const htmlContent = escapeHtml(aiText)
                .split("\n")
                .map((line: string) => {
                  const trimmed = line.trim();
                  if (!trimmed) return "<br/>";
                  return `<p style="margin:0 0 8px;color:#e0fafa;font-size:15px;line-height:1.6;">${trimmed}</p>`;
                })
                .join("");
              // Insert property cards IN THE MIDDLE — after the AI intro text, before the CTA
              const fullContent =
                htmlContent +
                (propertyCardsHtml
                  ? `<div style="margin-top:20px;border-top:1px solid #1a1e3a;padding-top:16px;"><p style="margin:0 0 10px;color:#4ef5f1;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Properties Selected For You</p>${propertyCardsHtml}</div>`
                  : "");
              subject = `${firstName}, we have properties matching your criteria — mAI Prop`;
              htmlBody = brandWrap(fullContent);
            }
          }
        } catch (e) {
          console.error("AI generation failed:", e);
        }
      }

      // Fallback if AI failed
      if (!htmlBody!) {
        const fallback = `
          <p style="margin:0 0 8px;color:#e0fafa;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
          <p style="margin:0 0 12px;color:#e0fafa;font-size:15px;line-height:1.6;">We've reviewed your profile and found some exciting opportunities that align with your investment goals. We currently have visa-eligible apartments and villas starting from €250,000 in prime Athens locations, offering strong rental yields and full renovation potential.</p>
          <p style="margin:0 0 12px;color:#e0fafa;font-size:15px;line-height:1.6;">Our team provides end-to-end support — from legal assistance and property verification to renovation and rental management — so you can invest with complete confidence.</p>
          <p style="margin:0 0 8px;color:#e0fafa;font-size:15px;line-height:1.6;">We'd love to schedule a quick call to walk you through the options. Let us know a time that works for you.</p>
          <p style="margin:0;color:#e0fafa;font-size:15px;line-height:1.6;">Warm regards,<br/>The mAI Prop Team</p>
        `;
        subject = `${firstName}, we have properties matching your criteria — mAI Prop`;
        htmlBody = brandWrap(fallback);
      }
    }

    // Preview mode — return HTML without sending
    if (preview_only) {
      return new Response(JSON.stringify({ success: true, preview: true, subject: subject!, html: htmlBody! }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Brevo
    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY!,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "mAI Prop", email: "kr@maiprop.co" },
        to: [{ email: dbLead.email, name: dbLead.full_name }],
        subject: subject!,
        htmlContent: htmlBody!,
      }),
    });

    const emailData = await emailRes.json();

    if (!emailRes.ok) {
      console.error("Brevo error:", JSON.stringify(emailData));
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, email_id: emailData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Contact lead error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
