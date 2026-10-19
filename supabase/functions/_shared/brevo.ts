const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface BrevoSender {
  email: string;
  name?: string;
}

export interface SendBrevoEmailInput {
  to: string | BrevoRecipient | Array<string | BrevoRecipient>;
  subject: string;
  html: string;
  text?: string;
  sender?: BrevoSender;
  replyTo?: BrevoRecipient;
  headers?: Record<string, string>;
  tags?: string[];
}

function normalizeRecipient(recipient: string | BrevoRecipient): BrevoRecipient {
  return typeof recipient === "string" ? { email: recipient } : recipient;
}

function normalizeRecipients(
  recipients: string | BrevoRecipient | Array<string | BrevoRecipient>,
): BrevoRecipient[] {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  return list.map(normalizeRecipient).filter((recipient) => Boolean(recipient.email));
}

export function getBrevoSender(fallbackName = "maiProp"): BrevoSender {
  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL");
  if (!fromEmail) {
    throw new Error("BREVO_FROM_EMAIL is not configured");
  }

  return {
    email: fromEmail,
    name: Deno.env.get("BREVO_FROM_NAME") ?? fallbackName,
  };
}

export async function sendBrevoEmailRaw(input: SendBrevoEmailInput): Promise<Response> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    throw new Error("At least one recipient is required");
  }

  return await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: input.sender ?? getBrevoSender(),
      to: recipients,
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
      replyTo: input.replyTo,
      headers: input.headers,
      tags: input.tags,
    }),
  });
}

export async function sendBrevoEmail(input: SendBrevoEmailInput): Promise<{
  messageId?: string;
}> {
  const response = await sendBrevoEmailRaw(input);

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(
      `Brevo send failed (${response.status}): ${errorBody || response.statusText}`,
    ) as Error & { status?: number; retryAfterSeconds?: number };
    error.status = response.status;
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) : 60;
      error.retryAfterSeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds
        : 60;
    }
    throw error;
  }

  const rawBody = await response.text();
  if (!rawBody) {
    return {};
  }

  try {
    const body = JSON.parse(rawBody) as { messageId?: string; message_id?: string };
    return { messageId: body.messageId ?? body.message_id };
  } catch {
    return {};
  }
}

export function parseEmailIdentity(raw: string | null | undefined): BrevoSender | undefined {
  if (!raw) return undefined;

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (!match) {
    return { email: trimmed };
  }

  const name = match[1].trim().replace(/^"|"$/g, "");
  const email = match[2].trim();
  return {
    email,
    ...(name ? { name } : {}),
  };
}
