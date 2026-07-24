-- 0009_hosting.sql
--
-- Phase 3 / TASK-166 (P3-M1): 호스팅 능력.
--
-- 1) build_request 에 호스팅 입력 2종을 더한다:
--    - context_path: 호스팅 URL prefix (미지정 시 서버가 app_name 정규화).
--    - runtime_port: 앱이 컨테이너 안에서 listen 하는 포트 (기본 8080).
--    두 값은 build 생성 시 할당·검증되어 runner 가 배포(P3-M2) 시 사용한다.
--
-- 2) hosted_service 테이블을 만든다 — 앱 1개의 지속 호스팅(앱당 1개 활성).
--    build 성공 배포 시 upsert 되며, app_name 과 context_path 는 각각 유일.

ALTER TABLE build_request ADD COLUMN IF NOT EXISTS context_path TEXT;
ALTER TABLE build_request ADD COLUMN IF NOT EXISTS runtime_port INTEGER NOT NULL DEFAULT 8080;

CREATE TABLE IF NOT EXISTS hosted_service (
  id UUID PRIMARY KEY,
  app_name TEXT NOT NULL,
  context_path TEXT NOT NULL,
  namespace TEXT NOT NULL,
  deployment_name TEXT NOT NULL,
  container_port INTEGER NOT NULL,
  strip_prefix BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL,
  url TEXT,
  current_build_id UUID,
  image_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_deployed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS hosted_service_app_name_idx
ON hosted_service (app_name);

CREATE UNIQUE INDEX IF NOT EXISTS hosted_service_context_path_idx
ON hosted_service (context_path);
