-- 0002_phase_history.sql (TASK-051)
--
-- v0.3 schema migration: build_request 에 phase_history jsonb 를 추가해
-- postgres repository 도 memory repository 와 같은 BuildStatusResponse
-- timeline semantics 를 저장할 수 있게 한다.

BEGIN;

ALTER TABLE build_request
  ADD COLUMN IF NOT EXISTS phase_history JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
