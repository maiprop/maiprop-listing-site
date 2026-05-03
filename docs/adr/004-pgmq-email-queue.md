# ADR-004: pgmq for Email Queue

**Date:** 2025  
**Status:** Accepted  
**Context:** Need reliable email delivery with retry capability  

## Decision

Use **pgmq** (Postgres Message Queue) for queuing emails, processed by the `process-email-queue` edge function on a pg_cron schedule.

## Rationale

- No external message broker needed (SQS, RabbitMQ, etc.)
- Transactional with the database — email enqueue is atomic with the triggering operation
- Visibility timeout prevents duplicate processing
- Dead letter queue (archive) for failed messages
- pg_cron triggers processing every 5 seconds

## Consequences

- Email sending is asynchronous (enqueue returns immediately)
- `process-email-queue` runs via pg_cron (`verify_jwt=true`, service-role invocation)
- Brevo (Sendinblue) is the SMTP provider (`_shared/brevo.ts`)
- Failed emails are retried up to 3 times with backoff
- Message format: `{ to, subject, html, template_id?, params? }`
