import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const deploymentAttemptTable = pgTable(
  "deployment_attempt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buildId: uuid("build_id").notNull(),
    status: text("status").notNull(),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref"),
    resultRef: text("result_ref"),
    responsePayloadJson: jsonb("response_payload_json"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    buildIdUnique: uniqueIndex("deployment_attempt_build_id_idx").on(table.buildId),
    statusCreatedAtIdx: index("deployment_attempt_status_created_at_idx").on(
      table.status,
      table.createdAt
    )
  })
);
