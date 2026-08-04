-- Service manifest registry and immutable revisions.
CREATE TABLE IF NOT EXISTS service_manifest (
  id UUID PRIMARY KEY,
  app_name TEXT NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 1,
  manifest JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_manifest_app_name_idx
ON service_manifest (app_name);

CREATE TABLE IF NOT EXISTS service_manifest_revision (
  id UUID PRIMARY KEY,
  app_name TEXT NOT NULL,
  revision INTEGER NOT NULL,
  manifest JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_manifest_revision_app_revision_idx
ON service_manifest_revision (app_name, revision);
