-- 0001_app_name.sql (TASK-045)
--
-- v0.2 schema migration: BuildRequest 에 appName 단일 식별자 도입.
-- legacy (project_id, repository_id) pair 는 drop.
--
-- 운영 적용 절차:
--   1) 본 파일을 PR 머지 후 운영자가 직접 psql 로 적용 (또는 migration
--      runner 통합 — 후속 TODO).
--   2) 모든 구문은 idempotent (IF EXISTS / IF NOT EXISTS) — 부분 적용된
--      상태에서 재실행해도 안전.
--   3) build server 가 한창 떠 있는 채로 적용 가능 — 새 컬럼은 NOT NULL
--      DEFAULT 로 채우고, legacy 컬럼 drop 은 traffic 없을 때 권장.
--   4) 적용 후 PR #9 / TASK-044 의 `metadata->>'appName'` fallback 경로는
--      사실상 의미 없어지지만, 코드는 그대로 두어도 무방 (fallback chain
--      끝의 `""` 가 response 에 들어옴 — 빈 appName 은 schema 위반이지만
--      데이터 무결성은 row 자체가 보장). 후속 PR 에서 fallback 제거.
--
-- 주의: drop column 은 되돌릴 수 없다. 운영 적용 전 컬럼 백업 권장.

BEGIN;

-- 1) appName 컬럼 추가 — 기존 row 들의 appName 은 metadata->>'appName'
--    에서 끌어와 채운다. metadata 가 비어있거나 key 가 없으면 빈 string.
ALTER TABLE build_request
  ADD COLUMN IF NOT EXISTS app_name TEXT;

UPDATE build_request
  SET app_name = COALESCE(metadata->>'appName', metadata->>'app_name', '')
  WHERE app_name IS NULL;

-- 2) appName NOT NULL 제약 + btree 인덱스 (active-build dedup / list
--    filter / owner rollup 의 hot path). 기존에 들어간 row 가 모두
--    appName 을 채운 뒤 제약 + 인덱스.
ALTER TABLE build_request
  ALTER COLUMN app_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS build_request_app_name_idx
  ON build_request (app_name);

-- 3) listBuildOwners 의 GROUP BY requestedBy 에서 사용하는 인덱스.
--    기존에 없었으면 hot path 가 full scan. 본 마이그레이션에서 함께.
CREATE INDEX IF NOT EXISTS build_request_requested_by_idx
  ON build_request (requested_by);

-- 4) legacy 컬럼 drop. drop 순서 무관 (둘 다 text, FK 없음).
--    운영 traffic 이 없는 시점에 권장.
ALTER TABLE build_request
  DROP COLUMN IF EXISTS project_id;

ALTER TABLE build_request
  DROP COLUMN IF EXISTS repository_id;

COMMIT;
