import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const testDeploymentTable = pgTable("test_deployment", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildId: uuid("build_id").notNull(),
  status: text("status").notNull(),
  previewUrl: text("preview_url"),
  readinessMessage: text("readiness_message"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
