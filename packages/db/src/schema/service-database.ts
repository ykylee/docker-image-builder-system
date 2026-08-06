import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Platform-owned record for a service's host-Postgres logical database.
// Credentials are never stored here; only the Kubernetes Secret reference is.
export const serviceDatabaseTable = pgTable(
  "service_database",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appName: text("app_name").notNull(),
    engine: text("engine").notNull().default("postgres"),
    schemaName: text("schema_name").notNull(),
    roleName: text("role_name").notNull(),
    secretName: text("secret_name").notNull(),
    status: text("status").notNull().default("PROVISIONING"),
    migrationCommand: text("migration_command"),
    migrationRevision: integer("migration_revision"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastMigratedAt: timestamp("last_migrated_at", { withTimezone: true })
  },
  (table) => ({
    appNameUnique: uniqueIndex("service_database_app_name_idx").on(table.appName),
    schemaNameUnique: uniqueIndex("service_database_schema_name_idx").on(table.schemaName),
    roleNameUnique: uniqueIndex("service_database_role_name_idx").on(table.roleName),
    secretNameUnique: uniqueIndex("service_database_secret_name_idx").on(table.secretName)
  })
);
