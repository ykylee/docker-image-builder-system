-- 0007_drop_legacy_preview_columns.sql
--
-- TASK-160 (P2-M1 Step 3): preview-era shim 컬럼 제거.
--
-- 배경:
--   TASK-053 이 canonical `build_test` / `deployment_attempt` 테이블을
--   추가하면서, 기존 코드가 계속 돌도록 `build_request` 의 preview 컬럼을
--   **의도적으로 남겨뒀다**(스키마 주석: "Retained during TASK-053").
--   가산은 끝났고 이 migration 이 감산을 닫는다.
--
-- 제거 대상:
--   preview_status       → canonical `build_test.status` (응답의 `test.status`)
--   preview_ttl_minutes  → canonical 모델에 대응 개념 없음. 소비처도 없었다.
--
-- 유지:
--   preview_url — 컨테이너 런타임 URL 을 나르는 유일한 필드다. canonical
--   이름(`runtime_url`)으로의 정렬은 test-deployment 엔드포인트 재설계와
--   결합돼 있어 P2-M2 에서 함께 처리한다.
--
-- 안전성: 두 컬럼 모두 읽는 코드가 이 커밋에서 함께 제거된다. 되돌리려면
-- 0007_down 에 해당하는 ADD COLUMN 이 필요하나, 본 프로젝트는 forward-only
-- migration 정책이라 별도 down 스크립트를 두지 않는다.

ALTER TABLE build_request DROP COLUMN IF EXISTS preview_status;
ALTER TABLE build_request DROP COLUMN IF EXISTS preview_ttl_minutes;
