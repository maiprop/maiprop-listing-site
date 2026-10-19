/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2.57.2'
import { getBrevoSender, sendBrevoEmailRaw } from '../_shared/brevo.ts'
import { dispatchAuthEmail, type AuthEmailSlot } from '../_shared/authEmailDispatch.ts'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { createLogger } from '../_shared/logger.ts'
import { getCorsHeaders } from '../_shared/cors.ts'

const log = createLogger('auth-email-hook')

type AuthEmailActionType =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'reauthentication'

interface SendEmailHookUser {
  id: string
  email?: string
  new_email?: string
}

interface SendEmailHookEmailData {
  token?: string
  token_hash?: string
  token_new?: string
  token_hash_new?: string
  redirect_to?: string
  site_url?: string
  email_action_type: AuthEmailActionType
}

interface SendEmailHookPayload {
  user: SendEmailHookUser
  email_data: SendEmailHookEmailData
}

interface OutboundAuthEmail {
  to: string
  subject: string
  html: string
  text: string
  templateName: AuthEmailSlot
}

const EMAIL_SUBJECTS: Record<AuthEmailActionType, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

// React.ComponentType is parameterised by props; each template here accepts a
// different prop shape (verification URL vs token, etc.). Keeping `any` for
// the union avoids a runtime narrowing layer that adds nothing — the per-
// template renderer below already passes the correct props.
const EMAIL_TEMPLATES: Record<AuthEmailActionType, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = 'maiProp'
const SAMPLE_PROJECT_URL = 'https://maiprop.co'
const SAMPLE_EMAIL = 'user@example.test'
const SAMPLE_DATA: Record<AuthEmailActionType, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

function getHookSecret(): string {
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  if (!secret) {
    throw new Error('SEND_EMAIL_HOOK_SECRET is not configured')
  }
  return secret
}

function getPreviewSecret(): string {
  return Deno.env.get('EMAIL_TEMPLATE_PREVIEW_SECRET') ?? getHookSecret()
}

function getWebhookVerifierSecret(): string {
  return getHookSecret().replace('v1,whsec_', '')
}

function buildAuthConfirmationUrl(
  tokenHash: string,
  actionType: AuthEmailActionType,
  redirectTo?: string,
): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured')
  }

  const verificationUrl = new URL('/auth/v1/verify', supabaseUrl)
  verificationUrl.searchParams.set('token', tokenHash)
  verificationUrl.searchParams.set('type', actionType)
  if (redirectTo) {
    verificationUrl.searchParams.set('redirect_to', redirectTo)
  }

  return verificationUrl.toString()
}

async function renderEmailTemplate(
  emailType: AuthEmailActionType,
  props: Record<string, string | undefined>,
): Promise<{ html: string; text: string }> {
  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  const html = await renderAsync(React.createElement(EmailTemplate, props))
  const text = await renderAsync(React.createElement(EmailTemplate, props), {
    plainText: true,
  })

  return { html, text }
}

async function buildStandardEmail(
  emailType: Exclude<AuthEmailActionType, 'email_change' | 'reauthentication'>,
  payload: SendEmailHookPayload,
): Promise<OutboundAuthEmail> {
  const recipient = payload.user.email
  const tokenHash = payload.email_data.token_hash
  if (!recipient || !tokenHash) {
    throw new Error(`Auth email payload is missing recipient or token hash for ${emailType}`)
  }

  const redirectTarget = payload.email_data.redirect_to || payload.email_data.site_url || SAMPLE_PROJECT_URL
  const confirmationUrl = buildAuthConfirmationUrl(tokenHash, emailType, redirectTarget)
  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: payload.email_data.site_url || SAMPLE_PROJECT_URL,
    recipient,
    confirmationUrl,
    token: payload.email_data.token,
    email: recipient,
    newEmail: payload.user.new_email,
  }

  const { html, text } = await renderEmailTemplate(emailType, templateProps)
  return {
    to: recipient,
    subject: EMAIL_SUBJECTS[emailType],
    html,
    text,
    templateName: emailType,
  }
}

async function buildEmailChangeEmails(payload: SendEmailHookPayload): Promise<OutboundAuthEmail[]> {
  const redirectTarget = payload.email_data.redirect_to || payload.email_data.site_url || SAMPLE_PROJECT_URL
  const currentEmail = payload.user.email
  const newEmail = payload.user.new_email
  const emails: OutboundAuthEmail[] = []

  // Supabase docs: token + token_hash_new go to the current email address.
  if (currentEmail && payload.email_data.token && payload.email_data.token_hash_new) {
    const confirmationUrl = buildAuthConfirmationUrl(
      payload.email_data.token_hash_new,
      'email_change',
      redirectTarget,
    )
    const { html, text } = await renderEmailTemplate('email_change', {
      siteName: SITE_NAME,
      email: currentEmail,
      newEmail: newEmail || currentEmail,
      confirmationUrl,
    })
    emails.push({
      to: currentEmail,
      subject: EMAIL_SUBJECTS.email_change,
      html,
      text,
      templateName: 'email_change_current',
    })
  }

  // Supabase docs: token_new + token_hash go to the new email address.
  const nextEmailToken = payload.email_data.token_new || payload.email_data.token
  if (newEmail && nextEmailToken && payload.email_data.token_hash) {
    const confirmationUrl = buildAuthConfirmationUrl(
      payload.email_data.token_hash,
      'email_change',
      redirectTarget,
    )
    const { html, text } = await renderEmailTemplate('email_change', {
      siteName: SITE_NAME,
      email: currentEmail || newEmail,
      newEmail,
      confirmationUrl,
    })
    emails.push({
      to: newEmail,
      subject: EMAIL_SUBJECTS.email_change,
      html,
      text,
      templateName: 'email_change_new',
    })
  }

  if (emails.length === 0) {
    throw new Error('Email change payload is missing token hashes or recipient emails')
  }

  return emails
}

async function buildOutboundEmails(payload: SendEmailHookPayload): Promise<OutboundAuthEmail[]> {
  const emailType = payload.email_data.email_action_type
  switch (emailType) {
    case 'signup':
    case 'invite':
    case 'magiclink':
    case 'recovery':
      return [await buildStandardEmail(emailType, payload)]
    case 'email_change':
      return await buildEmailChangeEmails(payload)
    case 'reauthentication': {
      const recipient = payload.user.email
      const token = payload.email_data.token
      if (!recipient || !token) {
        throw new Error('Reauthentication email payload is missing recipient or token')
      }
      const { html, text } = await renderEmailTemplate('reauthentication', { token })
      return [{
        to: recipient,
        subject: EMAIL_SUBJECTS.reauthentication,
        html,
        text,
        templateName: 'reauthentication',
      }]
    }
    default:
      throw new Error(`Unknown email type: ${String(emailType)}`)
  }
}

async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${getPreviewSecret()}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: AuthEmailActionType
  try {
    const body = await req.json()
    type = body.type
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sampleData = SAMPLE_DATA[type] || {}
  const html = await renderAsync(React.createElement(EmailTemplate, sampleData))

  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function handleWebhook(req: Request, corsHeaders: Record<string, string>): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('not allowed', { status: 400, headers: corsHeaders })
  }

  const payloadText = await req.text()
  const headers = Object.fromEntries(req.headers)
  let payload: SendEmailHookPayload
  try {
    const webhook = new Webhook(getWebhookVerifierSecret())
    payload = webhook.verify(payloadText, headers) as SendEmailHookPayload
  } catch {
    log.error('webhook verification failed', { code: 'invalid_signature' })
    return new Response(
      JSON.stringify({ error: 'Invalid webhook payload' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // The signed header is trusted only after verification of the exact raw body.
    const webhookId = req.headers.get('webhook-id')
    if (!webhookId || webhookId.length > 512 || webhookId !== webhookId.trim()) {
      throw new Error('invalid_webhook_identity')
    }
    const outboundEmails = await buildOutboundEmails(payload)
    const sender = getBrevoSender(SITE_NAME)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey || !Deno.env.get('BREVO_API_KEY')) {
      throw new Error('auth_email_configuration_missing')
    }
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    for (const outboundEmail of outboundEmails) {
      const accepted = await dispatchAuthEmail(client, webhookId, outboundEmail.templateName, () =>
        sendBrevoEmailRaw({
          to: outboundEmail.to,
          sender,
          subject: outboundEmail.subject,
          html: outboundEmail.html,
          text: outboundEmail.text,
          tags: [outboundEmail.templateName],
          headers: {
            'X-MaiProp-Template': outboundEmail.templateName,
            'X-MaiProp-Auth-User': payload.user.id,
          },
        }))
      if (!accepted) throw new Error('auth_email_dispatch_incomplete')
    }
  } catch {
    log.error('auth email hook error', { code: 'dispatch_incomplete' })
    return new Response(JSON.stringify({ error: 'Auth email dispatch incomplete' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(
    req,
    'webhook-id, webhook-signature, webhook-timestamp, x-supabase-client-runtime, x-supabase-client-runtime-version',
  )
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  try {
    return await handleWebhook(req, corsHeaders)
  } catch {
    log.error('webhook handler error', { code: 'handler_failed' })
    return new Response(JSON.stringify({ error: 'Auth email dispatch incomplete' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
