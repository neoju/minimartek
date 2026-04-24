# Issues / Gotchas

## Transaction Boundary

- emailSendingQueue.add() MUST be called AFTER db.transaction() resolves, NOT inside it
- Wrapping queue.add() inside transaction = ghost job if outer commit rolls back

## Stalled-Reclaimer New Logic

- Check: status='sending' AND zero processing recipients AND pending recipients exist AND no active BullMQ job
- Use emailSendingQueue.getJob(seed) to check; null means job was trimmed after success → re-enqueue
- Do NOT re-enqueue if job state is active/waiting/delayed

## sendCampaign Cancel Path

- If campaign is 'scheduled', must emailSendingQueue.remove(seedId) BEFORE adding immediate job

## Migration

- Edit in place: apps/backend/migrations/20260421000000_init.ts
- Remove: creating from campaign_status enum, recipients_mode column, queue_outbox table, queue_name enum, queue_outbox_action enum

## Verification Note

- Root `yarn check-types` still fails on pre-existing backend error in `apps/backend/src/modules/campaigns/service.ts` (Property `count` does not exist on type `string`). DTO workspace check-types passed.

## F4 Scope Audit (2026-04-24)

- REJECT: T4 violated required seed-job behavior. `apps/backend/src/modules/campaigns/service.ts:331-334` schedules with `jobId: getDispatchSeedJobId(campaignId)` but `apps/backend/src/modules/campaigns/service.ts:373-375` sends immediately with `jobId: createImmediateDispatchJobId(campaignId)` instead of the required `getDispatchSeedJobId(campaignId)`.
- REJECT: T4/T8 added unplanned queue helpers. `apps/backend/src/queues/queues.ts:32-48` introduces `enqueueDispatchJob` and `removeDispatchSeedJob`, which were not requested by any task.
- REJECT: T7/T9 scope creep. `apps/frontend/src/components/CampaignDetail/CampaignRecipientsList.tsx`, `apps/frontend/src/components/CampaignDetail/CampaignRecipientsTable.tsx`, `apps/frontend/src/lib/campaign.ts`, and `packages/dto/src/common.ts` were changed outside the task-owned file list/spec.
- REJECT: cross-cutting cleanup missed seed ownership. `apps/backend/seeds/02_campaigns.ts:65` and `apps/backend/seeds/02_campaigns.ts:78` still write `recipients_mode`, which is incompatible with the edited init migration and outside task scope.
- NOTE: dead-symbol grep was clean only in source slices requested by the plan, but repo-wide audit still found stale generated/build artifacts under `apps/backend/dist/**` and `apps/backend/tsconfig.tsbuildinfo` containing removed symbols.
