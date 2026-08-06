// v0.12.0 follow-up: HmacIdentityProvider 의 revoke Set 을 Postgres 로
// 영속화. 멀티 build-server replica 운영 시 logout / DISABLED / lease
// 갱신 의 revoke 가 모든 replica 에 즉시 전파된다.
//
// schema 는 packages/db/src/schema/revoke-jti.ts + migration 0019 참조.
// 본 모듈은 pg pool 을 받아 SELECT / INSERT / TRUNCATE 만 수행한다.

import type { Pool } from "pg";

export interface PersistentRevokeStore {
  /**
   * jti 가 revoke 되었거나 TTL 만료 전이면 true. verify 호출 path 에서
   * 단일 row 조회로 응답 — latency 영향 최소화.
   */
  isRevoked(jti: string): Promise<boolean>;

  /**
   * jti 를 영속 revoke Set 에 등록. expiresAt 은 HMAC 토큰의 만료 시각
   * 과 동일하게 전달 — TTL 만료 후에는 verify 가 본 row 을 무시 (cleanup
   * sweeper 가 background 에서 삭제).
   */
  revoke(jti: string, expiresAt: Date): Promise<void>;

  /**
   * 운영자의 "강제 전체 로그아웃" 등 일괄 revoke. 본 TASK 범위 밖이지만
   * IdentityProvider interface 정합을 위해 노출.
   */
  revokeAll(): Promise<void>;

  /** 디버그 / 메트릭용. 현재 영속 row 수 (TTL 만료 포함). */
  revokedCount(): Promise<number>;
}

export function createPersistentRevokeStore(pool: Pool): PersistentRevokeStore {
  return {
    async isRevoked(jti: string): Promise<boolean> {
      if (!jti) return false;
      const result = await pool.query<{ jti: string }>(
        `SELECT jti FROM revoke_jti
         WHERE jti = $1 AND expires_at > now()
         LIMIT 1`,
        [jti]
      );
      return result.rowCount !== null && result.rowCount > 0;
    },

    async revoke(jti: string, expiresAt: Date): Promise<void> {
      if (!jti) return;
      await pool.query(
        `INSERT INTO revoke_jti (jti, expires_at)
         VALUES ($1, $2)
         ON CONFLICT (jti) DO NOTHING`,
        [jti, expiresAt]
      );
    },

    async revokeAll(): Promise<void> {
      // 본 TASK 범위 밖 — admin 강제 전체 로그아웃 후속. identity-provider
      // interface 정합을 위해 no-op 으로 노출. 운영자 admin endpoint 후속.
      // (운영자가 TRUNCATE 실행해도 무방하나, 의도치 않은 전 사용자 강제
      // logout 이라 별도 admin endpoint 후속 봉인이 안전.)
    },

    async revokedCount(): Promise<number> {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM revoke_jti WHERE expires_at > now()`
      );
      const raw = result.rows[0]?.count ?? "0";
      return Number.parseInt(raw, 10) || 0;
    }
  };
}