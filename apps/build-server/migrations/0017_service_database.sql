-- Platform metadata for host-Postgres logical databases owned by hosted services.
-- Passwords are deliberately not stored here; only the Kubernetes Secret name is.
CREATE TABLE IF NOT EXISTS service_database (
  id UUID PRIMARY KEY,
  app_name TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'postgres',
  schema_name TEXT NOT NULL,
  role_name TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROVISIONING',
  migration_command TEXT,
  migration_revision INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_migrated_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS service_database_app_name_idx
ON service_database (app_name);

CREATE UNIQUE INDEX IF NOT EXISTS service_database_schema_name_idx
ON service_database (schema_name);

CREATE UNIQUE INDEX IF NOT EXISTS service_database_role_name_idx
ON service_database (role_name);

CREATE UNIQUE INDEX IF NOT EXISTS service_database_secret_name_idx
ON service_database (secret_name);
