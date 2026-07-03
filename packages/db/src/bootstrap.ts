import type { DatabasePool } from "./client.js";

const bootstrapStatements = [
  `
    CREATE TABLE IF NOT EXISTS build_request (
      id UUID PRIMARY KEY,
      project_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      preview_status TEXT NOT NULL,
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
  `
];

export async function ensureDbSchema(pool: DatabasePool): Promise<void> {
  for (const statement of bootstrapStatements) {
    await pool.query(statement);
  }
}
