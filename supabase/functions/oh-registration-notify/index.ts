import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    // Called by DB webhook: { type: "UPDATE", record: {...}, old_record: {...} }
    const { record, old_record } = payload;

    if (!record || !old_record) {
      return new Response(JSON.stringify({ ok: false, reason: "missing payload" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newStatus: string = record.status;
    const oldStatus: string = old_record.status;

    // Only fire on approved or rejected transitions
    if (newStatus === oldStatus) {
      return new Response(JSON.stringify({ ok: true, reason: "no change" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newStatus !== "approved" && newStatus !== "rejected") {
      return new Response(JSON.stringify({ ok: true, reason: "status not notifiable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch requester profile email via auth.admin
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(record.requester_id);
    if (userErr || !userData?.user?.email) {
      console.error("Could not fetch user email:", userErr);
      return new Response(JSON.stringify({ ok: false, reason: "user not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipientEmail = userData.user.email;

    // Fetch listing details
    const { data: listing } = await supabase
      .from("listings")
      .select("title, city, open_house_date")
      .eq("id", record.listing_id)
      .single();

    const listingTitle = listing?.title || "Open House";
    const openHouseDate = listing?.open_house_date
      ? new Date(listing.open_house_date).toLocaleDateString("en-GB", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        })
      : null;

    const isApproved = newStatus === "approved";
    const subject = isApproved
      ? `✅ Your registration for "${listingTitle}" has been approved`
      : `Your registration for "${listingTitle}" was not approved`;

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
        <!-- Header -->
        <tr><td style="background:${isApproved ? "#059669" : "#dc2626"};padding:24px 32px">
          <p style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px">MaiProp · Open Houses</p>
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0">
            ${isApproved ? "Registration Approved 🎉" : "Registration Update"}
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px">
          <p style="color:#111827;font-size:15px;margin:0 0 20px">
            ${isApproved
              ? `Great news! Your registration for the open house event has been <strong>approved</strong>.`
              : `We're sorry, your registration for the open house event was <strong>not approved</strong> at this time.`
            }
          </p>

          <div style="background:#f3f4f6;border-radius:8px;padding:16px 20px;margin-bottom:20px">
            <p style="color:#374151;font-size:14px;font-weight:600;margin:0 0 8px">${listingTitle}</p>
            ${listing?.city ? `<p style="color:#6b7280;font-size:13px;margin:0 0 4px">📍 ${listing.city}</p>` : ""}
            ${openHouseDate ? `<p style="color:#6b7280;font-size:13px;margin:0">📅 ${openHouseDate}</p>` : ""}
          </div>

          ${isApproved ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:20px">
            <p style="color:#166534;font-size:13px;margin:0">
              ✅ You are now cleared to attend. Please bring a valid ID on the day of the event.
              ${record.timeslot_index != null ? " Your assigned timeslot will be confirmed separately." : ""}
            </p>
          </div>` : `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:20px">
            <p style="color:#991b1b;font-size:13px;margin:0">
              You can contact the listing agent for more information or browse other open houses on MaiProp.
            </p>
            ${rejectionNote}
          </div>`}

          <a href="https://maiprop-listing-site.lovable.app/open-houses/${record.listing_id}"
             style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">
            View Open House →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid #e5e7eb;padding:16px 32px;background:#f9fafb">
          <p style="color:#9ca3af;font-size:12px;margin:0">
            You received this email because you registered for an open house on MaiProp.
            <br>© ${new Date().getFullYear()} MaiProp. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Send via Lovable email API
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not set");
      return new Response(JSON.stringify({ ok: false, reason: "email api key missing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRes = await fetch("https://email.lovable.app/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        from: "notify@notify.properties.maiprop.co",
        to: recipientEmail,
        subject,
        html: htmlBody,
        message_id: `oh-reg-${record.id}-${newStatus}`,
        template_name: "oh_registration_status",
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Email send failed:", errText);
      return new Response(JSON.stringify({ ok: false, reason: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Sent ${newStatus} email to ${recipientEmail} for registration ${record.id}`);
    return new Response(JSON.stringify({ ok: true, status: newStatus, recipient: recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("oh-registration-notify error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
