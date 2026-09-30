import { createClient } from 'npm:@supabase/supabase-js@2.57.2'
import { parseEmailIdentity, sendBrevoEmail } from '../_shared/brevo.ts'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { createLogger } from '../_shared/logger.ts'

const log = createLogger('process-email-queue')

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

interface QueuePayload {
  run_id?: string
  to?: string
  from?: string
  sender_domain?: string
  subject?: string
  html?: string
  text?: string
  purpose?: string
  label?: string
  idempotency_key?: string
  unsubscribe_token?: string
  message_id?: string
  queued_at?: string
}

interface QueueMessage {
  msg_id: number
  read_ct: number
  message: QueuePayload
}

function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req)
  if (corsPreflightResponse) return corsPreflightResponse
  const corsHeaders = getCorsHeaders(req)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const brevoFromEmail = Deno.env.get('BREVO_FROM_EMAIL')

  if (!brevoFromEmail || !supabaseUrl || !supabaseServiceKey) {
    log.error('missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // verify_jwt=true (config.toml) ensures the JWT is cryptographically valid.
  // This additional role check enforces that only service-role callers
  // (for example a pg_cron HTTP job using the service key) can trigger queue processing.
  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  for (const queue of ['auth_emails', 'transactional_emails']) {
    const dlq = `${queue}_dlq`
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      log.error('failed to read email batch', { queue, err: String(readError.message ?? readError) })
      continue
    }

    const typedMessages = (messages ?? []) as QueueMessage[]
    if (typedMessages.length === 0) continue

    const messageIds = Array.from(
      new Set(
        typedMessages
          .map((msg) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id): id is string => Boolean(id))
      )
    )

    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        log.error('failed to load failed-attempt counters', {
          queue,
          err: String(failedRowsError.message ?? failedRowsError),
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < typedMessages.length; i++) {
      const msg = typedMessages[i]
      const payload = msg.message
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : 0

      if (payload.queued_at) {
        const ageMs = Date.now() - new Date(payload.queued_at).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          log.warn('email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: payload.queued_at,
            ttl_minutes: ttlMinutes[queue],
          })
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'dlq',
            error_message: `TTL exceeded (${ttlMinutes[queue]} minutes)`,
          })
          const { error: ttlDlqError } = await supabase.rpc('move_to_dlq', {
            source_queue: queue,
            dlq_name: dlq,
            message_id: msg.msg_id,
            payload,
          })
          if (ttlDlqError) {
            log.error('failed to move expired message to DLQ', { queue, msg_id: msg.msg_id, err: String(ttlDlqError.message ?? ttlDlqError) })
          }
          continue
        }
      }

      if (failedAttempts >= MAX_RETRIES) {
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'dlq',
          error_message: `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`,
        })
        const { error: retryDlqError } = await supabase.rpc('move_to_dlq', {
          source_queue: queue,
          dlq_name: dlq,
          message_id: msg.msg_id,
          payload,
        })
        if (retryDlqError) {
          log.error('failed to move max-retry message to DLQ', { queue, msg_id: msg.msg_id, err: String(retryDlqError.message ?? retryDlqError) })
        }
        continue
      }

      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          log.warn('skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: payload.message_id,
          })
          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (dupDelError) {
            log.error('failed to delete duplicate message from queue', { queue, msg_id: msg.msg_id, err: String(dupDelError.message ?? dupDelError) })
          }
          continue
        }
      }

      let providerAccepted = false
      try {
        const sender = parseEmailIdentity(payload.from) ?? { email: brevoFromEmail }
        await sendBrevoEmail({
          to: payload.to ?? '',
          sender,
          subject: payload.subject ?? 'Notification',
          html: payload.html ?? '',
          text: payload.text,
          headers: {
            ...(payload.message_id ? { 'X-MaiProp-Message-Id': payload.message_id } : {}),
            ...(payload.idempotency_key ? { 'X-MaiProp-Idempotency-Key': payload.idempotency_key } : {}),
            ...(payload.purpose ? { 'X-MaiProp-Purpose': payload.purpose } : {}),
            ...(payload.unsubscribe_token ? { 'X-MaiProp-Unsubscribe-Token': payload.unsubscribe_token } : {}),
          },
          tags: payload.label ? [payload.label] : undefined,
        })
        providerAccepted = true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const rateLimited = isRateLimited(error)
        log.error('email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          err: rateLimited ? 'rate_limited' : errorMsg,
        })

        if (rateLimited) {
          const retryAfterSecs = getRetryAfterSeconds(error)
          let logPersisted = false
          let logErrorCode: string | null = null
          try {
            const { error: logError } = await supabase.from('email_send_log').insert({
              message_id: payload.message_id,
              template_name: payload.label || queue,
              recipient_email: payload.to,
              status: 'rate_limited',
              error_message: errorMsg.slice(0, 1000),
            })
            logPersisted = !logError
            logErrorCode = logError?.code ?? null
          } catch {
            logErrorCode = 'transport_failure'
          }

          let statePersisted = false
          let stateErrorCode: string | null = null
          let stateRows = 0
          try {
            const { data: updatedState, error: stateError } = await supabase
              .from('email_send_state')
              .update({
                retry_after_until: new Date(
                  Date.now() + retryAfterSecs * 1000
                ).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', 1)
              .select('id')
            stateRows = updatedState?.length ?? 0
            statePersisted = !stateError && stateRows === 1 && updatedState[0]?.id === 1
            stateErrorCode = stateError?.code ?? null
          } catch {
            stateErrorCode = 'transport_failure'
          }

          if (!logPersisted || !statePersisted) {
            log.error('rate-limit persistence failed', {
              queue,
              msg_id: msg.msg_id,
              log_error: logErrorCode,
              state_error: stateErrorCode,
              state_rows: stateRows,
            })
            return new Response(
              JSON.stringify({
                processed: totalProcessed,
                stopped: 'rate_limited',
                log_persisted: logPersisted,
                state_persisted: statePersisted,
              }),
              { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })
        if (payload?.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }
      }

      if (providerAccepted) {
        let sentLogPersisted = false
        let sentLogErrorCode: string | null = null
        try {
          const { error: sentLogError } = await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'sent',
          })
          sentLogPersisted = !sentLogError
          sentLogErrorCode = sentLogError?.code ?? null
        } catch {
          sentLogErrorCode = 'transport_failure'
        }

        let queueDeleted = false
        let deleteErrorCode: string | null = null
        try {
          const { data: deleted, error: delError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          queueDeleted = !delError && deleted === true
          deleteErrorCode = delError?.code ?? (queueDeleted ? null : 'not_deleted')
          if (delError) {
            log.error('failed to delete sent message from queue', {
              queue,
              msg_id: msg.msg_id,
              err: deleteErrorCode,
            })
          }
        } catch {
          deleteErrorCode = 'transport_failure'
        }

        if (!sentLogPersisted || !queueDeleted) {
          try {
            log.error('accepted email bookkeeping failed', {
              queue,
              msg_id: msg.msg_id,
              sent_log_error: sentLogErrorCode,
              delete_error: deleteErrorCode,
            })
          } catch {
            // Keep the known provider acceptance and persistence result in the response.
          }
          return new Response(
            JSON.stringify({
              processed: totalProcessed + 1,
              stopped: 'bookkeeping_failed',
              provider_accepted: true,
              persistence_complete: false,
              sent_log_persisted: sentLogPersisted,
              queue_deleted: queueDeleted,
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        totalProcessed++
      }

      if (i < typedMessages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
