-- Hosting tier/resource policy snapshot (v1).
ALTER TABLE build_request
  ADD COLUMN IF NOT EXISTS service_size TEXT NOT NULL DEFAULT 'small',
  ADD COLUMN IF NOT EXISTS requested_tier TEXT,
  ADD COLUMN IF NOT EXISTS effective_tier TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS hosting_policy_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS resource_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE hosted_service
  ADD COLUMN IF NOT EXISTS service_size TEXT NOT NULL DEFAULT 'small',
  ADD COLUMN IF NOT EXISTS effective_tier TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS hosting_policy_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS resource_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
