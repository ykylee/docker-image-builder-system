-- TASK-066: build_source (1:1 snapshot of the source archive bytes)
-- Stores the raw archive bytes the Skill uploaded after POST /builds.
-- The Runner downloads them via GET /builds/:buildId/source before
-- running the docker build. 1 row per build, FK to build_request(id)
-- with ON DELETE CASCADE so source bytes do not outlive the build.
--
-- This migration is idempotent (CREATE TABLE / INDEX IF NOT EXISTS) so
-- it is safe to re-run against a database that has already been
-- bootstrapped via `ensureDbSchema`. The schema is also added to
-- packages/db/src/bootstrap.ts so greenfield databases get the table
-- on first boot without a separate `psql -f` step.

CREATE TABLE IF NOT EXISTS build_source (
  build_id UUID PRIMARY KEY,
  bytes BYTEA NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS build_source_build_id_idx
  ON build_source (build_id);

CREATE INDEX IF NOT EXISTS build_source_checksum_idx
  ON build_source (checksum_sha256);

-- FK to build_request(id) is added idempotently here so the cascade
-- delete behaviour is in place regardless of whether the table was
-- created by `ensureDbSchema` (bootstrap.ts) or by a previous run of
-- this migration. Matches the 0003 pattern for build_test /
-- deployment_attempt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'build_source_build_id_fkey'
  ) THEN
    ALTER TABLE build_source
      ADD CONSTRAINT build_source_build_id_fkey
      FOREIGN KEY (build_id) REFERENCES build_request(id) ON DELETE CASCADE;
  END IF;
END
$$;
