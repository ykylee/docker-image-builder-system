-- 0011_hosting_scheme.sql
--
-- v0.5.0 / TASK-172: 호스팅 URL 스킴(subdomain 대안).
--
-- path(기본) = `host/<context-path>/`(APP_BASE_PATH 규약).
-- subdomain  = `<context-path>.host/`(앱 무수정, 루트 서빙 — sub-path 자산
--              제약 없음, 단 wildcard DNS/TLS 필요).
-- build 생성 시 build_request 에 저장, 배포 성공 시 hosted_service 에 반영.

ALTER TABLE build_request ADD COLUMN IF NOT EXISTS hosting_scheme TEXT NOT NULL DEFAULT 'path';
ALTER TABLE hosted_service ADD COLUMN IF NOT EXISTS hosting_scheme TEXT NOT NULL DEFAULT 'path';
