import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

// TASK-069: runner registry table. One row per registered runner id
// (RUNNER_ID env on the runner process). The first claim from a given
// id auto-creates the row with status=ACTIVE; admin can PATCH
// status=DISABLED to block subsequent claims; admin can DELETE to
// permanently remove the record.
//
// counters (buildsClaimed / buildsCompleted) enable the admin UI's
// quick-glance row without a JOIN back to build_request.
//
// currentBuildId is nulled whenever the build reaches a terminal
// phase (COMPLETED / FAILED) — admin UI 가 "지금 어떤 빌드 돌고 있지"
// 를 정확히 표시할 수 있도록 한다.
//
// The schema is intentionally narrow: runner_id, status, two counters,
// timestamps, optional current_build_id + last_error. capabilities /
// labels / tags 는 의도적으로 v1 scope 에서 제외 — Runner 가 자기 자신을
// 표현하는 방식 (env var / admin 수동 등록) 이 runner 별로 다양해서
// schema 관리가 복잡해진다.

export const runnerTable = pgTable(
  "runner",
  {
    runnerId: text("runner_id").primaryKey(),
    status: text("status").notNull().default("ACTIVE"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    buildsClaimed: bigint("builds_claimed", { mode: "number" })
      .notNull()
      .default(0),
    buildsCompleted: integer("builds_completed").notNull().default(0),
    currentBuildId: text("current_build_id"),
    lastError: text("last_error")
  },
  (table) => ({
    // runnerId is the primary key; the unique index is here for parity
    // with the other registry tables and to make the lookup by id
    // explicit in the EXPLAIN plan.
    runnerIdIdx: uniqueIndex("runner_runner_id_idx").on(table.runnerId),
    // Status filter (admin UI chips: ACTIVE / DISABLED) + sort by
    // lastSeenAt desc to surface the most-recent runners first.
    statusLastSeenIdx: index("runner_status_last_seen_idx").on(
      table.status,
      table.lastSeenAt
    )
  })
);

export type RunnerRow = typeof runnerTable.$inferSelect;
