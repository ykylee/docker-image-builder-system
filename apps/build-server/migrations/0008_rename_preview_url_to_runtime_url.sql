-- 0008_rename_preview_url_to_runtime_url.sql
--
-- TASK-161 (P2-M2): preview-era 이름의 마지막 잔재 정렬.
--
-- `build_request.preview_url` 은 컨테이너 런타임 URL 을 나르는 필드다.
-- canonical 모델은 같은 개념을 `build_test.runtime_url` 로 부른다 —
-- 한 값에 두 이름이 있던 것을 하나로 맞춘다.
--
-- P2-M1(0007)이 preview_status / preview_ttl_minutes 를 지웠고, 이 migration
-- 으로 build_request 에서 preview-era 어휘가 완전히 사라진다.

ALTER TABLE build_request RENAME COLUMN preview_url TO runtime_url;
