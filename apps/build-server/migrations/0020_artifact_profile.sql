ALTER TABLE build_request
  ADD COLUMN IF NOT EXISTS artifact_profile JSONB;
