# ADR-004: Email delivery and retained queue capability

Status: source implementation documented 27 September 2026; hosted scheduling and external queue producers unverified. This supersedes the earlier claim that all email is queued and processed every five seconds.

## Current source

Auth mail and several notification/marketing handlers send directly to the provider. process-email-queue remains a service-authorized consumer of auth_emails and transactional_emails, with existing batch/visibility/failure handling. SQL queue wrappers and retained data remain. A source search finding no enqueue producer is not evidence that external producers or historical jobs are inactive.

Task12a repairs four existing handlers without introducing a queue or changing schedules. Saved-search alerts authenticate before configuration checks and update their snapshot only after provider acceptance and an exact conditional persisted-row acknowledgement. Followups distinguish accepted send from failed checkpoint and preserve progression when concurrent state changes. Scheduled followups inspect child business completion, not only HTTP200. Auction polling retains successful imports while reporting item/page failures and failed outcome logging separately.

HTTP acceptance is not inbox delivery. An empty optional provider body does not undo a successful HTTP acceptance; a transport timeout can leave acceptance unknown. Provider acceptance plus failed database persistence is a partial result. Do not blindly resend unknown or accepted operations: a later invocation can duplicate delivery.

## Open guarantees

Current queue schedule, deployed function/config parity, external producers and retained jobs require explicit environment evidence. No five-second dispatch/retry guarantee is established. Durable per-email admission, dispatch/result correlation, accepted-but-uncheckpointed recovery, old-worker drain and provider deduplication guarantees remain Task12b work. No queue activation or retirement is authorized by this ADR.

## Operations

Identify the producer and inspect its separate transport, provider and checkpoint outcomes before choosing recovery. Preserve IDs and bounded safe counts, not recipient content or credentials. Delivery/bounce evidence must come from the provider's delivery events. See [On-call](../ON_CALL.md) and [the controlled release path](../PRODUCTION_RELEASE_RUNBOOK.md).
