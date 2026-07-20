import { customType, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { bytea } from "./build-source.js";

// TASK-106: build_source_chunk (N:1 split of the source archive bytes).
// One row per chunk; many rows per build (1 row per uploaded chunk, default N=1 for parity with TASK-066). The actual bytes are uploaded via
// `POST /builds/:buildId/source/chunk` with `Content-Range: bytes <start>-<end>/<total>`
// and reassembled by the server on `GET /builds/:buildId/source`.
//
// `idx` is the 0-based chunk index (0, 1, 2, ...). The set of rows for
// a given buildId must cover `[0, total_chunk_count)` with no gaps and
// no duplicates — verified by a uniqueness index on (build_id, idx).
// The FK to `build_request(id)` is added in the SQL migration
// (`apps/build-server/migrations/0006_build_source_chunked.sql`) rather
// than in the Drizzle schema to match the existing snapshot-table
// pattern (build_test, deployment_attempt, build_source). Bootstrapping
// via `packages/db/src/bootstrap.ts` therefore only creates the column
// shape, and the FK is added when the operator runs the migration.
export const buildSourceChunkTable = pgTable(
  "build_source_chunk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildId: uuid("build_id").notNull(),
    idx: integer("idx").notNull(),
    bytes: bytea("bytes").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    buildIdIdxIdxUnique: uniqueIndex("build_source_chunk_build_id_idx_unique").on(
      table.buildId,
      table.idx
    ),
    buildIdIdx: index("build_source_chunk_build_id_idx").on(table.buildId)
  })
);
