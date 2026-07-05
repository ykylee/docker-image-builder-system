-- TASK-069: runner registry (admin menu backing store, postgres variant).
-- One row per registered runner id (RUNNER_ID env value). Self-registered
-- on first claim; admin can PATCH status=DISABLED to block subsequent
-- claims; admin can DELETE to remove.
--
-- This migration is idempotent (CREATE TABLE / INDEX IF NOT EXISTS) so
-- it is safe to re-run against a database that has already been
-- bootstrapped via `ensureDbSchema`. The schema is also added to
-- packages/db/src/bootstrap.ts so greenfield databases get the table
-- on first boot without a separate `psql -f` step.

CREATE TABLE IF NOT EXISTS runner (
  runner_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  builds_claimed BIGINT NOT NULL DEFAULT 0,
  builds_completed INTEGER NOT NULL DEFAULT 0,
  current_build_id TEXT,
  last_error TEXT
);

-- Index list mirrors `packages/db/src/schema/runner.ts`:
--   runner_runner_id_idx is redundant with PRIMARY KEY but kept for
--   the EXPLAIN plan to spell it out.
--   runner_status_last_seen_idx supports the admin UI's status
--   filter + sort-by-last-seen.
CREATE UNIQUE INDEX IF NOT EXISTS runner_runner_id_idx
  ON runner (runner_id);

CREATE INDEX IF NOT EXISTS runner_status_last_seen_idx
  ON runner (status, last_seen_at);
