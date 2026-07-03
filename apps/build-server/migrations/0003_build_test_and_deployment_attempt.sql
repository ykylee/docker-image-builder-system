CREATE TABLE IF NOT EXISTS build_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES build_request(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  host TEXT,
  host_port INTEGER,
  internal_port INTEGER,
  runtime_url TEXT,
  container_ref TEXT,
  health_check_passed BOOLEAN,
  port_open BOOLEAN,
  stability_window_passed BOOLEAN,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS build_test_build_id_idx
ON build_test (build_id);

CREATE INDEX IF NOT EXISTS build_test_status_created_at_idx
ON build_test (status, created_at);

CREATE TABLE IF NOT EXISTS deployment_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES build_request(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_ref TEXT,
  result_ref TEXT,
  response_payload_json JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS deployment_attempt_build_id_idx
ON deployment_attempt (build_id);

CREATE INDEX IF NOT EXISTS deployment_attempt_status_created_at_idx
ON deployment_attempt (status, created_at);

-- Legacy preview-era table intentionally retained during TASK-053.
-- Current repository/service code still reads/writes preview-oriented
-- runtime state here. Removal or data backfill is deferred to the
-- server migration tasks (TASK-054+).
