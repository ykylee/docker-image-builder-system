ALTER TABLE build_request
  ADD COLUMN IF NOT EXISTS dockerfile_mode TEXT NOT NULL DEFAULT 'required';
