import type { DatabasePool } from "./client.js";

const bootstrapStatements = [
  `
    CREATE TABLE IF NOT EXISTS build_request (
      id UUID PRIMARY KEY,
      app_name TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      preview_status TEXT NOT NULL,
      phase_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_archive_key TEXT NOT NULL,
      source_archive_checksum_sha256 TEXT NOT NULL,
      source_archive_size_bytes INTEGER NOT NULL,
      entrypoint_path TEXT NOT NULL,
      dockerfile_path TEXT NOT NULL,
      preview_ttl_minutes INTEGER NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      preview_url TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS build_log (
      id UUID PRIMARY KEY,
      build_id UUID NOT NULL,
      phase TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS build_test (
      id UUID PRIMARY KEY,
      build_id UUID NOT NULL,
      status TEXT NOT NULL,
      host TEXT,
      host_port INTEGER,
      internal_port INTEGER,
      runtime_url TEXT,
      container_ref TEXT,
      health_check_passed BOOLEAN,
      port_open BOOLEAN,
      stability_window_passed BOOLEAN,
      error_code TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS build_test_build_id_idx
    ON build_test (build_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS build_test_status_created_at_idx
    ON build_test (status, created_at)
  `,
  `
    CREATE TABLE IF NOT EXISTS deployment_attempt (
      id UUID PRIMARY KEY,
      build_id UUID NOT NULL,
      status TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_ref TEXT,
      result_ref TEXT,
      response_payload_json JSONB,
      error_code TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS deployment_attempt_build_id_idx
    ON deployment_attempt (build_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS deployment_attempt_status_created_at_idx
    ON deployment_attempt (status, created_at)
  `,
  `
    CREATE TABLE IF NOT EXISTS test_deployment (
      id UUID PRIMARY KEY,
      build_id UUID NOT NULL,
      status TEXT NOT NULL,
      preview_url TEXT,
      readiness_message TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS build_source (
      build_id UUID PRIMARY KEY,
      bytes BYTEA NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS build_source_build_id_idx
    ON build_source (build_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS build_source_checksum_idx
    ON build_source (checksum_sha256)
  `,
  // TASK-106: chunked split. See
  // `apps/build-server/migrations/0006_build_source_chunked.sql` for the
  // migration that mirrors this shape (idempotent); postgres backend's
  // build-server wired migrations auto-run on boot. The legacy single-row
  // `build_source` table from TASK-066 stays in place — uploads via the
  // chunked endpoint `POST /builds/:buildId/source/chunk` write here.
  `
    CREATE TABLE IF NOT EXISTS build_source_chunk (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      build_id UUID NOT NULL,
      idx INTEGER NOT NULL,
      bytes BYTEA NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS build_source_chunk_build_id_idx_unique
    ON build_source_chunk (build_id, idx)
  `,
  `
    CREATE INDEX IF NOT EXISTS build_source_chunk_build_id_idx
    ON build_source_chunk (build_id)
  `,
  // TASK-069: runner registry. Single TEXT PK (runner_id = canonical id
  // from RUNNER_ID env). counters + status + timestamps + optional
  // current_build_id + last_error. See 0005_runner_registry.sql for the
  // migration that mirrors this shape (idempotent); postgres backend's
  // build-server wired migrations auto-run on boot.
  `
    CREATE TABLE IF NOT EXISTS runner (
      runner_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      builds_claimed BIGINT NOT NULL DEFAULT 0,
      builds_completed INTEGER NOT NULL DEFAULT 0,
      current_build_id TEXT,
      last_error TEXT
    )
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS runner_runner_id_idx
    ON runner (runner_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS runner_status_last_seen_idx
    ON runner (status, last_seen_at)
  `
];

export async function ensureDbSchema(pool: DatabasePool): Promise<void> {
  for (const statement of bootstrapStatements) {
    await pool.query(statement);
  }
}
