import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.57.2";
import { getBrevoSender, sendBrevoEmailRaw } from "../_shared/brevo.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

import {
  dispatchOHStatusEvent,
  isEventId,
  type OHSnapshot,
} from "../_shared/ohStatusEvent.ts";

const log = createLogger("oh-registration-notify");

const webhookRecordSchema = z.record(z.string(), z.unknown()).and(z.object({
  id: z.unknown().optional(),
  requester_id: z.string().min(1),
  listing_id: z.string().min(1),
  status: z.string().min(1),
  rejection_reason: z.string().optional().nullable(),
  timeslot_index: z.number().int().optional().nullable(),
}));

const webhookPayloadSchema = z.record(z.string(), z.unknown()).and(z.object({
  record: webhookRecordSchema.optional().nullable(),
  old_record: webhookRecordSchema.optional().nullable(),
}));

function verifyWebhookSecret(req: Request): boolean {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret) {
    log.error("WEBHOOK_SECRET not configured - rejecting request");
    return false;
  }
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (!verifyWebhookSecret(req)) {
    return new Response(JSON.stringify({ ok: false, reason: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await parseJsonBody(req, webhookPayloadSchema);
    if (Object.hasOwn(payload, "event_id")) {
      if (!isEventId(payload.event_id) || payload.event_version !== 1) {
        return new Response(
          JSON.stringify({ ok: false, code: "oh_event_invalid" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const status = await dispatchOHStatusEvent(
        supabase,
        payload.event_id,
        (row) => prepareEmail(supabase, row, payload.event_id as string),
      );
      return new Response(
        JSON.stringify(
          status ? { ok: true, status } : { ok: false, code: "oh_event_held" },
        ),
        {
          status: status ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { record, old_record } = payload;

    if (!record || !old_record) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing payload" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const newStatus: string = record.status;
    const oldStatus: string = old_record.status;

    if (newStatus === oldStatus) {
      return new Response(JSON.stringify({ ok: true, reason: "no change" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newStatus !== "approved" && newStatus !== "rejected") {
      return new Response(
        JSON.stringify({ ok: true, reason: "status not notifiable" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const send = await prepareEmail(supabase, record, undefined);
    const response = await send();
    if (!response.ok) throw new Error("oh_provider_unconfirmed");
    log.info("oh_status_accepted");
    return new Response(JSON.stringify({ ok: true, status: newStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      return new Response(
        JSON.stringify({ ok: false, code: "oh_payload_invalid" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    log.error("oh_notification_failed");
    return new Response(
      JSON.stringify({ ok: false, code: "oh_notification_failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

async function prepareEmail(
  supabase: SupabaseClient,
  record: OHSnapshot | z.infer<typeof webhookRecordSchema>,
  eventId?: string,
): Promise<() => Promise<Response>> {
  const newStatus = record.status;
  const { data: userData, error: userErr } = await supabase.auth.admin
    .getUserById(record.requester_id);
  if (userErr || !userData?.user?.email) {
    throw new Error("oh_preparation_failed");
  }
  const recipientEmail = userData.user.email;

  const { data: listing } = await supabase
    .from("listings")
    .select("title, city, open_house_date")
    .eq("id", record.listing_id)
    .single();

  const listingTitle = listing?.title || "Open House";
  const openHouseDate = listing?.open_house_date
    ? new Date(listing.open_house_date).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    : null;

  const isApproved = newStatus === "approved";
  const subject = isApproved
    ? `Approved: Your registration for "${listingTitle}"`
    : `Update: Your registration for "${listingTitle}" was not approved`;

  const rejectionNote = record.rejection_reason
    ? `<p style="color:#6b7280;margin-top:8px"><strong>Reason:</strong> ${record.rejection_reason}</p>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#f9fafb;font-family:system-ui,sans-serif;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:${
    isApproved ? "#059669" : "#dc2626"
  };padding:24px 32px">
          <p style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px">mAI prop - Open Houses</p>
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0">
            ${isApproved ? "Registration Approved" : "Registration Update"}
          </h1>
        </td></tr>

        <tr><td style="padding:28px 32px">
          <p style="color:#111827;font-size:15px;margin:0 0 20px">
            ${
    isApproved
      ? `Great news! Your registration for the open house event has been <strong>approved</strong>.`
      : `We're sorry, your registration for the open house event was <strong>not approved</strong> at this time.`
  }
          </p>

          <div style="background:#f3f4f6;border-radius:8px;padding:16px 20px;margin-bottom:20px">
            <p style="color:#374151;font-size:14px;font-weight:600;margin:0 0 8px">${listingTitle}</p>
            ${
    listing?.city
      ? `<p style="color:#6b7280;font-size:13px;margin:0 0 4px">Location: ${listing.city}</p>`
      : ""
  }
            ${
    openHouseDate
      ? `<p style="color:#6b7280;font-size:13px;margin:0">Date: ${openHouseDate}</p>`
      : ""
  }
          </div>

          ${
    isApproved
      ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:20px">
            <p style="color:#166534;font-size:13px;margin:0">
              You are now cleared to attend. Please bring a valid ID on the day of the event.
              ${
        record.timeslot_index != null
          ? " Your assigned timeslot will be confirmed separately."
          : ""
      }
            </p>
          </div>`
      : `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:20px">
            <p style="color:#991b1b;font-size:13px;margin:0">
              You can contact the listing agent for more information or browse other open houses on MaiProp.
            </p>
            ${rejectionNote}
          </div>`
  }

          <a href="https://portal.maiprop.co/open-houses/${record.listing_id}"
             style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">
            View Open House
          </a>
        </td></tr>

        <tr><td style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb">
          <p style="color:#9ca3af;font-size:12px;margin:0">
            You received this email because you registered for an open house on MaiProp.
            <br>(c) ${new Date().getFullYear()} mAI prop. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const sender = getBrevoSender("MaiProp Open Houses");
  if (!Deno.env.get("BREVO_API_KEY")) throw new Error("oh_preparation_failed");
  return () =>
    sendBrevoEmailRaw({
      to: recipientEmail,
      subject,
      html: htmlBody,
      sender,
      tags: ["oh_registration_status"],
      headers: {
        "X-MaiProp-Message-Id": eventId
          ? `oh-event-${eventId}`
          : `oh-reg-${record.id}-${newStatus}`,
        "X-MaiProp-Template": "oh_registration_status",
      },
    });
}
