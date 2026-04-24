106:### Deviation 4 — Removed (recipients_mode gone)
108:This deviation was removed on 2026-04-24. The system now only supports specific recipient lists, which are materialized synchronously during campaign creation. This simplifies the workflow and eliminates the need for a separate preparation queue.
110:### Deviation 5 — Removed (queue_outbox gone)
169:- Removing the `recipients_mode` and `queue_outbox` features to simplify the architecture.
188:- Refactor the backend to remove the preparation queue andTransactional Outbox pattern, replacing it with synchronous materialization and Redis AOF persistence.
191:Remove the `recipients_mode` column from the `campaigns` table and delete the `queue_outbox` table. Update the campaign service to materialize `campaign_recipients` synchronously during the `createCampaign` transaction. Replace the Transactional Outbox pattern with direct `emailSendingQueue.add()` calls after the transaction commit, relying on Redis AOF for durability.
196:- In the initial implementation, the agent tried to keep the `creating` status for campaigns even though materialization was now synchronous. I had to explicitly instruct it to remove the `creating` status as it was no longer necessary.
