-- 0010_hosting_strip_prefix.sql
--
-- Phase 3 / TASK-169 (P3-M4): 호스팅 sub-path 대응.
--
-- build_request 에 strip_prefix 를 더한다. Ingress 가 context-path prefix 를
-- strip 하는지 결정한다(기본 TRUE — rewrite-target 으로 벗김 + 앱은 APP_BASE_PATH
-- 로 emit URL 에만 prefix). FALSE 면 pass-through(앱 서버가 `/<cp>/...` 직접
-- 서빙, base-path-aware 서버). build 생성 시 저장, runner 가 배포 시 사용.

ALTER TABLE build_request ADD COLUMN IF NOT EXISTS strip_prefix BOOLEAN NOT NULL DEFAULT TRUE;
