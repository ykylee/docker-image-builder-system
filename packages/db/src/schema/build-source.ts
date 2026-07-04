import { customType, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// `bytea` Drizzle column wrapper. Drizzle ships a `customType` helper for
// raw SQL types that have no first-class Drizzle helper (e.g. PostgreSQL
// `bytea`). We use it here to keep the binary column as `Uint8Array` on
// the TypeScript side and `bytea` on the wire. The `bytea` column does
// not have a server-side `default` because the row is always inserted
// with the caller-supplied archive bytes — there is no meaningful
// "empty archive" sentinel.
export const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return "bytea";
  }
});

// TASK-066: per-build source archive storage. One row per build, keyed
// by `build_id` (1:1 with `build_request.id`). The actual bytes (e.g.
// tar.gz of the source) are uploaded via `POST /builds/:buildId/source`
// and downloaded by the Runner via `GET /builds/:buildId/source`.
//
// The FK to `build_request(id)` is added in the SQL migration
// (`apps/build-server/migrations/0004_build_source.sql`) rather than in
// the Drizzle schema to match the existing 1:1 snapshot tables
// (`build_test`, `deployment_attempt`) — see those files for the same
// pattern. Bootstrapping via `packages/db/src/bootstrap.ts` therefore
// only creates the column shape, and the FK is added when the operator
// runs the migration against an existing database.
export const buildSourceTable = pgTable(
  "build_source",
  {
    buildId: uuid("build_id").primaryKey(),
    bytes: bytea("bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    // build_id is already the primary key; the unique index is here for
    // parity with the other 1:1 snapshot tables and to make the lookup
    // by buildId explicit in the EXPLAIN plan.
    buildIdIdx: uniqueIndex("build_source_build_id_idx").on(table.buildId),
    checksumIdx: index("build_source_checksum_idx").on(table.checksumSha256)
  })
);
