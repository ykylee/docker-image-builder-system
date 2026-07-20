-- TASK-106: build_source_chunk (N:1 split of the source archive bytes).
-- Many rows per build, each carrying one chunk of the archive. The
-- server reassembles chunks on GET /builds/:buildId/source by
-- concatenating `bytes` ordered by `idx`.
--
-- The legacy single-row `build_source` table from TASK-066 is left
-- in place — uploads via the legacy `POST /builds/:buildId/source`
-- endpoint continue to write to `build_source`, and uploads via the
-- new chunked endpoint `POST /builds/:buildId/source/chunk` write to
-- `build_source_chunk`. Operators reading the bytes see whichever side
-- has data (chunked takes precedence on a per-build basis).
--
-- This migration is idempotent (CREATE TABLE / INDEX IF NOT EXISTS) so
-- it is safe to re-run against a database that has already been
-- bootstrapped via `ensureDbSchema`. The schema is also added to
-- `packages/db/src/bootstrap.ts` so greenfield databases get the
-- table on first boot without a separate `psql -f` step.

CREATE TABLE IF NOT EXISTS build_source_chunk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL,
  idx INTEGER NOT NULL,
  bytes BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (build_id, idx) uniqueness is the operational invariant: every chunk
-- at any given index position is uploaded at most once. Resuming a
-- partial upload means picking a different idx (e.g. gap-aware retry)
-- rather than re-uploading the same idx.
CREATE UNIQUE INDEX IF NOT EXISTS build_source_chunk_build_id_idx_unique
  ON build_source_chunk (build_id, idx);

CREATE INDEX IF NOT EXISTS build_source_chunk_build_id_idx
  ON build_source_chunk (build_id);

-- FK to build_request(id) is added idempotently here so the cascade
-- delete behaviour is in place regardless of whether the table was
-- created by `ensureDbSchema` (bootstrap.ts) or by a previous run of
-- this migration. Matches the 0003/0004 patterns for build_test /
-- deployment_attempt / build_source.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'build_source_chunk_build_id_fkey'
  ) THEN
    ALTER TABLE build_source_chunk
      ADD CONSTRAINT build_source_chunk_build_id_fkey
      FOREIGN KEY (build_id) REFERENCES build_request(id) ON DELETE CASCADE;
  END IF;
END
$$;
