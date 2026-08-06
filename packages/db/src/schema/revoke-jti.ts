import {
  index,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

// v0.12.0 follow-up: Phase 1 Identity + Phase 2 Runner 인증 의 HMAC
// 토큰 jti revoke 영속화 (Postgres). 멀티 build-server replica 운영
// 시 logout / DISABLED / lease 갱신 의 revoke 가 즉시 모든 replica 에
// 전파되도록 단일 source-of-truth 로 운영.
//
// schema 는 좁게 — jti PK + expires_at + created_at. build-server 가
// verify 시 (jti, expires_at > now) 조건으로 단일 row 조회. TTL 만료된
// row 은 주기 cleanup (background sweeper) 으로 정리 — 본 TASK 의
// 범위 밖 (Phase 3 follow-up).

export const revokeJtiTable = pgTable(
  "revoke_jti",
  {
    jti: text("jti").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    // expires_at index — cleanup sweeper 가 TTL 만료 row 을 빠르게 삭제.
    expiresAtIdx: index("revoke_jti_expires_at_idx").on(table.expiresAt)
  })
);

export type RevokeJtiRow = typeof revokeJtiTable.$inferSelect;
export type NewRevokeJtiRow = typeof revokeJtiTable.$inferInsert;