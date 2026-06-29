import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getBrevoSender, sendBrevoEmail } from "../_shared/brevo.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("invitation-notify");
const limiter = makeRateLimiter({
  bucket: "invitation-notify",
  maxRequests: 10,
  windowMs: 60_000,
});
const requireEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const invitationNotificationSchema = z.object({
  type: z.enum(["approved", "rejected"]),
  email: z.email(),
  full_name: z.string().trim().min(1).optional().nullable(),
  rejection_reason: z.string().trim().min(1).optional().nullable(),
  tier: z.string().trim().min(1).optional().nullable(),
  payment_url: z.string().trim().url("Invalid payment URL").optional().nullable(),
});

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

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

    const body = await parseJsonBody(req, invitationNotificationSchema);
    const { type, email, full_name, rejection_reason, tier, payment_url } = body;

    const firstName = full_name?.split(" ")[0] || "there";
    const appUrl = "https://portal.maiprop.co/";
    const paymentUrl = payment_url ?? `${appUrl}investor-dashboard?payment=pending`;

    let subject: string;
    let html: string;

    if (type === "approved") {
      subject = "Your MaiProp Deal Flow application has been approved";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:#0a0e1a;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">
              <span style="color:#d4af37;">mai</span>prop
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Deal Flow</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fb;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 16px 16px;padding:40px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0e1a;">Congratulations, ${firstName}!</p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">Your invitation request to MaiProp's exclusive Deal Flow has been <strong style="color:#10b981;">approved</strong>. Complete the payment step to activate access to the curated off-market deal pipeline.</p>

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
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#065f46;">After payment, your plan includes:</p>
              <ul style="margin:0;padding-left:18px;color:#047857;font-size:13px;line-height:1.8;">
                <li>Access to off-market distressed assets</li>
                <li>AI-powered deal scoring and valuation</li>
                <li>Direct seller contact details</li>
                <li>Priority alerts for new deals</li>
              </ul>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${paymentUrl}" style="display:inline-block;background:#0a0e1a;color:#d4af37;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:10px;letter-spacing:0.5px;">
                  Complete Payment
                </a>
              </td></tr>
            </table>

            <p style="margin:32px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
              Approval does not activate access until payment is confirmed. Questions? Contact us at <a href="mailto:kr@maiprop.co" style="color:#d4af37;">kr@maiprop.co</a>
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
        <tr>
          <td style="background:#0a0e1a;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">
              <span style="color:#d4af37;">mai</span>prop
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;">Deal Flow</p>
          </td>
        </tr>
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
      return new Response(
        JSON.stringify({ error: "Invalid type. Use 'approved' or 'rejected'" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await sendBrevoEmail({
      to: email,
      subject,
      html,
      sender: getBrevoSender("MaiProp Deal Flow"),
      tags: ["deal_flow_invitation_status"],
      headers: {
        "X-MaiProp-Template": "deal_flow_invitation_status",
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      return new Response(JSON.stringify({ error: err.message, code: err.code, issues: err.issues }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log.error("invitation-notify error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
