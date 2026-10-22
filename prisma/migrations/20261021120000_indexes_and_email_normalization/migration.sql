-- Composite indexes matching the hot list queries
-- (WHERE projectId/taskId = ? AND deletedAt IS NULL ORDER BY createdAt).
-- They replace the single-column projectId / taskId indexes (same leading column).
DROP INDEX "tasks_projectId_idx";
DROP INDEX "comments_taskId_idx";

-- CreateIndex
CREATE INDEX "tasks_projectId_deletedAt_createdAt_idx" ON "tasks"("projectId", "deletedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "comments_taskId_deletedAt_createdAt_idx" ON "comments"("taskId", "deletedAt", "createdAt");

-- CreateIndex (used by the scheduled refresh-token cleanup)
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- Emails are now trimmed and lower-cased by the API. Normalise existing rows,
-- skipping any row whose normalised form would collide with another account
-- (those need a manual decision):
--   SELECT lower(btrim(email)), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
UPDATE "users" u
SET "email" = lower(btrim(u."email"))
WHERE u."email" <> lower(btrim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "users" o
    WHERE o."id" <> u."id" AND o."email" = lower(btrim(u."email"))
  );
