-- Access-token versioning: bumped on password change so old access tokens die immediately.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Refresh-token reuse grace window: remember when a token was revoked.
ALTER TABLE "refresh_tokens" ADD COLUMN "revokedAt" TIMESTAMP(3);
UPDATE "refresh_tokens" SET "revokedAt" = "createdAt" WHERE "revoked" = true;

-- Task search: ILIKE '%q%' on title/description needs trigram indexes to avoid seq scans.
-- pg_trgm is a trusted extension (PG13+), so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "tasks_description_trgm_idx" ON "tasks" USING GIN ("description" gin_trgm_ops);

-- Replace low-selectivity single-column indexes with a composite one used by status filters.
DROP INDEX IF EXISTS "tasks_status_idx";
DROP INDEX IF EXISTS "tasks_deletedAt_idx";
CREATE INDEX "tasks_projectId_status_idx" ON "tasks"("projectId", "status");

-- Defence in depth: the API stores emails trimmed + lower-cased. NOT VALID enforces it for
-- new/updated rows without failing on legacy rows that still need a manual decision.
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_chk"
  CHECK ("email" = lower(btrim("email"))) NOT VALID;
