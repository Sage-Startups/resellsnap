-- One active generation per item, enforced by the database.
--
-- `startGeneration` checked for a running job and then created one, which is a
-- read-then-create race: two requests a few milliseconds apart (a double-click,
-- or a browser retry) both saw "nothing running" and both charged a credit.
-- Measured on a real database, three concurrent calls charged three credits and
-- queued three generations for a single item.
--
-- A partial unique index closes it at the only place that can be authoritative.
-- It cannot be expressed in the Prisma schema, which has no partial-index
-- support, so it lives here and is documented on the model.
CREATE UNIQUE INDEX "ai_job_one_active_per_item"
  ON "ai_job" ("itemId")
  WHERE "itemId" IS NOT NULL AND "status" IN ('QUEUED', 'RUNNING');
