import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

    const token = authHeader.slice("Bearer ".length).trim();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only platform admins may send invitation notifications (EF-3 fix)
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, is_platform_admin")
      .eq("user_id", user.id)
      .single();
    if (!adminProfile?.is_platform_admin && adminProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { type, email, full_name, rejection_reason, tier } = body;

    if (!type || !email) {
      return new Response(JSON.stringify({ error: "type and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const firstName = full_name?.split(" ")[0] || "there";
    const appUrl = "https://portal.maiprop.co/";

    let subject: string;
    let html: string;

    if (type === "approved") {
      subject = "🎉 Your MaiProp Deal Flow access has been approved";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0a0e1a;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">
              <span style="color:#d4af37;">mai</span>prop
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Deal Flow</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#f8f9fb;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 16px 16px;padding:40px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0e1a;">Congratulations, ${firstName}!</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">Your invitation request to MaiProp's exclusive Deal Flow has been <strong style="color:#10b981;">approved</strong>. You now have full access to our curated off-market deal pipeline.</p>

            ${
              tier
                ? `
            <div style="background:#0a0e1a;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Access tier</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#d4af37;text-transform:capitalize;">${tier}</p>
            </div>
            `
                : ""
            }

            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:20px 24px;margin:0 0 32px;">
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#065f46;">What's included:</p>
              <ul style="margin:0;padding-left:18px;color:#047857;font-size:13px;line-height:1.8;">
                <li>Access to off-market distressed assets</li>
                <li>AI-powered deal scoring and valuation</li>
                <li>Direct seller contact details</li>
                <li>Priority alerts for new deals</li>
              </ul>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${appUrl}/firesale" style="display:inline-block;background:#0a0e1a;color:#d4af37;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:10px;letter-spacing:0.5px;">
                  View Deal Flow →
                </a>
              </td></tr>
            </table>

            <p style="margin:32px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
              Your 1-year access is now active. Questions? Contact us at <a href="mailto:kr@maiprop.co" style="color:#d4af37;">kr@maiprop.co</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    } else if (type === "rejected") {
      subject = "Update on your MaiProp Deal Flow application";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0a0e1a;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">
              <span style="color:#d4af37;">mai</span>prop
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Deal Flow</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#f8f9fb;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 16px 16px;padding:40px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0e1a;">Thank you for applying, ${firstName}</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">After carefully reviewing your application, we're unable to approve access to MaiProp Deal Flow at this time.</p>

            ${
              rejection_reason
                ? `
            <div style="background:#fef9e7;border:1px solid #fde68a;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#92400e;">Reason</p>
              <p style="margin:0;font-size:14px;color:#78350f;line-height:1.6;">${rejection_reason}</p>
            </div>
            `
                : ""
            }

            <p style="margin:0 0 32px;font-size:14px;color:#6b7280;line-height:1.6;">If you believe your profile has changed or you'd like to provide additional information, you're welcome to reapply in the future.</p>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${appUrl}" style="display:inline-block;background:#0a0e1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:10px;">
                  Explore MaiProp
                </a>
              </td></tr>
            </table>

            <p style="margin:32px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
              Questions? Contact us at <a href="mailto:kr@maiprop.co" style="color:#d4af37;">kr@maiprop.co</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid type. Use 'approved' or 'rejected'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Lovable email API
    const emailRes = await fetch("https://api.lovable.dev/api/v1/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        to: email,
        subject,
        html,
        from_name: "MaiProp Deal Flow",
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("Email API error:", err);
      throw new Error(`Email send failed: ${emailRes.status}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("invitation-notify error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
