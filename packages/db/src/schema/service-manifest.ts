import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid, integer } from "drizzle-orm/pg-core";

export const serviceManifestTable = pgTable(
  "service_manifest",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appName: text("app_name").notNull(),
    currentRevision: integer("current_revision").notNull().default(1),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({ appNameUnique: uniqueIndex("service_manifest_app_name_idx").on(table.appName) })
);

export const serviceManifestRevisionTable = pgTable(
  "service_manifest_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appName: text("app_name").notNull(),
    revision: integer("revision").notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    appRevisionUnique: uniqueIndex("service_manifest_revision_app_revision_idx").on(
      table.appName,
      table.revision
    )
  })
);
