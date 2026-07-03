import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// v0.2 schema (TASK-045): appName 이 canonical identifier 다. legacy
// project_id / repository_id 컬럼은 bootstrap.ts 의 bootstrapStatements
// 가 신규 DB 에서는 만들지 않는다. 기존 운영 DB 는 migrations/0001
// 의 ALTER TABLE 을 운영자가 수동으로 적용 (idempotent 한 ALTER TABLE
// ADD COLUMN IF NOT EXISTS + DROP COLUMN IF EXISTS).
export const buildRequestTable = pgTable("build_request", {
  id: uuid("id").defaultRandom().primaryKey(),
  appName: text("app_name").notNull(),
  requestedBy: text("requested_by").notNull(),
  status: text("status").notNull(),
  phase: text("phase").notNull(),
  previewStatus: text("preview_status").notNull(),
  sourceArchiveKey: text("source_archive_key").notNull(),
  sourceArchiveChecksumSha256: text("source_archive_checksum_sha256").notNull(),
  sourceArchiveSizeBytes: integer("source_archive_size_bytes").notNull(),
  entrypointPath: text("entrypoint_path").notNull(),
  dockerfilePath: text("dockerfile_path").notNull(),
  previewTtlMinutes: integer("preview_ttl_minutes").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull(),
  previewUrl: text("preview_url"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
