import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const buildLogTable = pgTable("build_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildId: uuid("build_id").notNull(),
  phase: text("phase").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
