# Decisions

## Architecture Decisions

- recipients_mode removed entirely (single mode: specific list)
- queue_outbox pattern dropped; rely on Redis AOF + extended stalled-reclaimer
- campaign_recipients materialized synchronously in POST /campaigns transaction
- emailSendingQueue.add() called AFTER transaction commit (not inside)
- Stalled-reclaimer: new pass detects sending campaigns with no active dispatch job
- createImmediateDispatchJobId: relocate from outbox.ts to queues.ts
- Unknown emails: silently skipped; 400 NO_MATCHING_RECIPIENTS if ALL unknown
- Duplicate emails: de-duplicated (trim + lowercase + Set)
