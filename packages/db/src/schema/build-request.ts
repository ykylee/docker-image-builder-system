import { sql } from "drizzle-orm";
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
  phaseHistory: jsonb("phase_history")
    .$type<Array<{ phase: string; completedAt: string }>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  sourceArchiveKey: text("source_archive_key").notNull(),
  sourceArchiveChecksumSha256: text("source_archive_checksum_sha256").notNull(),
  sourceArchiveSizeBytes: integer("source_archive_size_bytes").notNull(),
  entrypointPath: text("entrypoint_path").notNull(),
  dockerfilePath: text("dockerfile_path").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull(),
  // TASK-161 (P2-M2): canonical 이름으로 정렬 — build_test.runtime_url 과
  // 같은 개념이다. 구 preview_url 은 migration 0008 에서 rename 됐다.
  runtimeUrl: text("runtime_url"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
