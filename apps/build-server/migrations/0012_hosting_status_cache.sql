-- 0012_hosting_status_cache.sql
--
-- v0.7.0 / TASK-174: 호스팅 status 캐시.
--
-- 관리/배포가 갱신하는 desired lifecycle `status` 와 별개로, 주기 sync 가
-- k8s 실측 available replica 수를 캐시한다. admin 목록/상세가 kubectl 호출
-- 없이 live 상태(및 degraded 여부)를 보여주기 위한 read cache.
--   available_replicas — 마지막 sync 시 실측 available replica (NULL=미sync)
--   last_synced_at     — 마지막 sync 시각 (NULL=미sync)

ALTER TABLE hosted_service ADD COLUMN IF NOT EXISTS available_replicas INTEGER;
ALTER TABLE hosted_service ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
