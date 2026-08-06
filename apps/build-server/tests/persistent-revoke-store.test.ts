// v0.12.0 follow-up: persistent revoke store 회귀 가드.
//
// in-memory mock PG pool 로 PersistentRevokeStore 동작 검증.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createPersistentRevokeStore } from "../src/auth/persistent-revoke-store.js";

interface MockRevokeRow {
  jti: string;
  expires_at: Date;
}

type MockPool = {
  rows: MockRevokeRow[];
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }>;
};

function createMockPool(): MockPool {
  const rows: MockRevokeRow[] = [];
  return {
    rows,
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("SELECT jti FROM revoke_jti")) {
        const [jti] = params as [string];
        const now = new Date();
        const found = rows.find(
          (r) => r.jti === jti && r.expires_at.getTime() > now.getTime()
        );
        return {
          rowCount: found ? 1 : 0,
          rows: found ? [{ jti: found.jti }] : []
        };
      }
      if (sql.includes("INSERT INTO revoke_jti")) {
        const [jti, expiresAt] = params as [string, Date];
        if (!rows.find((r) => r.jti === jti)) {
          rows.push({ jti, expires_at: expiresAt });
        }
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("SELECT count(*)")) {
        const now = new Date();
        const count = rows.filter(
          (r) => r.expires_at.getTime() > now.getTime()
        ).length;
        return {
          rowCount: count > 0 ? 1 : 0,
          rows: [{ count: String(count) }]
        };
      }
      return { rowCount: 0, rows: [] };
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPool = any;

describe("PersistentRevokeStore", () => {
  it("isRevoked — 등록 안 된 jti 는 false", async () => {
    const pool = createMockPool();
    const store = createPersistentRevokeStore(pool as AnyPool);
    assert.equal(await store.isRevoked("unknown"), false);
  });

  it("revoke + isRevoked — 등록된 jti 는 true", async () => {
    const pool = createMockPool();
    const store = createPersistentRevokeStore(pool as AnyPool);
    const expiresAt = new Date(Date.now() + 60_000);
    await store.revoke("jti-1", expiresAt);
    assert.equal(await store.isRevoked("jti-1"), true);
  });

  it("isRevoked — 만료된 jti 는 false", async () => {
    const pool = createMockPool();
    const store = createPersistentRevokeStore(pool as AnyPool);
    const expiresAt = new Date(Date.now() - 60_000);
    await store.revoke("jti-expired", expiresAt);
    assert.equal(await store.isRevoked("jti-expired"), false);
  });

  it("revoke — 동일 jti 중복 호출은 no-op (ON CONFLICT DO NOTHING)", async () => {
    const pool = createMockPool();
    const store = createPersistentRevokeStore(pool as AnyPool);
    const expiresAt = new Date(Date.now() + 60_000);
    await store.revoke("jti-dup", expiresAt);
    await store.revoke("jti-dup", expiresAt);
    assert.equal(pool.rows.length, 1);
  });

  it("revokedCount — 만료 전 jti 수만 카운트", async () => {
    const pool = createMockPool();
    const store = createPersistentRevokeStore(pool as AnyPool);
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    await store.revoke("jti-future", future);
    await store.revoke("jti-past", past);
    assert.equal(await store.revokedCount(), 1);
  });

  it("revokeAll — interface 정합 (no-op)", async () => {
    const pool = createMockPool();
    const store = createPersistentRevokeStore(pool as AnyPool);
    await store.revokeAll();
    assert.equal(pool.rows.length, 0);
  });
});