import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const buildRequestTable = pgTable("build_request", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: text("project_id").notNull(),
  repositoryId: text("repository_id").notNull(),
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
