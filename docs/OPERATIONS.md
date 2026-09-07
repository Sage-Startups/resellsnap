# Operations

Day-to-day running of ResellSnap AI.

## Health and readiness

| Endpoint | Checks | Use for |
| --- | --- | --- |
| `/api/health` | the process is alive | the platform healthcheck |
| `/api/ready` | the process **and** the database | your own monitoring |

The healthcheck deliberately does not touch the database. If it did, a brief
database blip would make Railway restart a perfectly healthy container, turning
a short outage into a longer one.

`/admin/health` shows queue depth, worker liveness and each external
integration's status. It reports whether a secret is *present*, never its
value.

## The worker

Nothing generates without it. Photo processing, listing generation and export
building all run through the queue.

Signs it is down or behind:

- Uploads sit at "processing" and the wizard's Continue stays disabled.
- `/admin/health` shows a rising "oldest queued" figure.
- Items stay in `ANALYZING`.

Restart the worker service. Jobs it was holding are reclaimed automatically
after they go stale, so an interrupted job is retried rather than lost.

Scale it with `WORKER_CONCURRENCY` (jobs in flight per process) or by adding
replicas. `FOR UPDATE SKIP LOCKED` means replicas never collide.

## Scheduled maintenance

`pnpm maintenance` — run daily by the Cron service — reclaims stalled jobs,
expires download artifacts past their retention window and deletes their
objects from storage, purges soft-deleted items and their photos, refreshes
marketplace connection state, and prunes expired OAuth states and rate-limit
rows. It reports a count for each.

(Dead-lettering is not part of this: a job moves there the moment it exhausts
its retries, in the worker.)

It can also be triggered over HTTP at `/api/cron/maintenance` with the
`CRON_SECRET` bearer token, if you would rather schedule it externally.

## Failed jobs

`/admin/ai` lists AI jobs with their status, duration, cost and error. A job
that exhausted its retries is `FAILED`, its item is back in `DRAFT`, and the
customer's credit has been refunded — check the ledger entry rather than
trusting the cached balance if you are investigating a dispute.

You can retry or cancel a job from that page. Retrying an already-refunded job
does not double-charge: the debit carries a deterministic key.

## Credits and disputes

`credit_ledger` is append-only and is the authority. The workspace columns are
a cache of it. To reconcile:

```sql
SELECT
  w."monthlyCredits" + w."purchasedCredits" AS cached,
  COALESCE(SUM(l.delta), 0)                 AS ledger
FROM workspace w
LEFT JOIN credit_ledger l ON l."workspaceId" = w.id
WHERE w.id = $1
GROUP BY w.id, w."monthlyCredits", w."purchasedCredits";
```

These must agree. If they ever do not, the ledger is right and something wrote
the cache outside a ledger transaction — that is a bug, not a data-entry
problem, and correcting the cache without an entry hides it.

Adjust a customer's balance from their record in `/admin/users/<id>`. A reason
is required, the entry records who made it, and an audit row is written. Never
edit the ledger by hand.

## Stripe

Webhook deliveries are recorded with their outcome and are visible at
`/admin/webhooks`, where a failed one can be replayed. Replay is safe:
processing deduplicates on the Stripe event id, and every grant carries its own
idempotency key, so even a bug in the handler cannot double-grant.

If billing looks wrong, check in this order: the Stripe dashboard (what was
actually charged), the webhook log (what we received), then the credit ledger
(what we did about it).

## Marketplace connections

A connection moves to `REAUTH_REQUIRED` when eBay rejects the stored refresh
token. The customer sees a reconnect prompt; there is nothing to do
operationally beyond telling them to reconnect.

`EXPIRED` means the token lapsed and will be refreshed on next use. `ERROR`
records a sanitised failure — tokens are never written to logs or to the error
column.

## Rotating secrets

- `BETTER_AUTH_SECRET` — rotating signs everyone out. Harmless, but do it
  deliberately.
- `TOKEN_ENCRYPTION_KEY` — **rotating makes every stored marketplace token
  unreadable.** Every customer must reconnect. The key version is stored
  alongside each token so a migration path exists, but there is no automatic
  re-encryption; plan it.
- `STRIPE_WEBHOOK_SECRET` — update in Stripe and in the variables together.
  Deliveries in between will be rejected and retried by Stripe.

## Backups

Railway's PostgreSQL backups cover the database. The object storage bucket is
not covered by them — configure your provider's versioning or lifecycle rules
separately. Losing the bucket loses customers' photographs, which they may not
have anywhere else.

## Cost control

`AI_DAILY_COST_LIMIT_CENTS` caps estimated daily AI spend; set it above zero to
arm the breaker. `/admin/ai` shows spend over the last 24 hours and today.

Generation is also gated per workspace by the credit system and by a burst
limit, so a single account cannot run away with the bill.
