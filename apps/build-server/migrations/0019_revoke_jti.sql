-- v0.12.0 follow-up: HMAC 토큰 jti revoke 영속화.
--
-- 멀티 build-server replica 운영 시 in-memory revoke Set 한계 해소.
-- 모든 replica 가 단일 source-of-truth (Postgres) 를 조회 + 갱신.
-- verify 시 expires_at > now() 조건으로 row 조회 — TTL 만료된 row 은
-- build-server 의 verify 가 자연스럽게 pass 시키므로 cleanup 은 별도
-- sweeper 가 background 에서 수행 (Phase 3 follow-up).
CREATE TABLE IF NOT EXISTS revoke_jti (
  jti text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- expires_at index — cleanup sweeper 가 TTL 만료 row 을 빠르게 삭제.
CREATE INDEX IF NOT EXISTS revoke_jti_expires_at_idx
  ON revoke_jti (expires_at);