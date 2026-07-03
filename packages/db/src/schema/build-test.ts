import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const buildTestTable = pgTable(
  "build_test",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buildId: uuid("build_id").notNull(),
    status: text("status").notNull(),
    host: text("host"),
    hostPort: integer("host_port"),
    internalPort: integer("internal_port"),
    runtimeUrl: text("runtime_url"),
    containerRef: text("container_ref"),
    healthCheckPassed: boolean("health_check_passed"),
    portOpen: boolean("port_open"),
    stabilityWindowPassed: boolean("stability_window_passed"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    buildIdUnique: uniqueIndex("build_test_build_id_idx").on(table.buildId),
    statusCreatedAtIdx: index("build_test_status_created_at_idx").on(table.status, table.createdAt)
  })
);
