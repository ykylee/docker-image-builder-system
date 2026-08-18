CREATE TABLE IF NOT EXISTS auth_session (
  id UUID PRIMARY KEY,
  subject TEXT NOT NULL,
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_session_expires_at_idx ON auth_session (expires_at);

CREATE TABLE IF NOT EXISTS auth_oidc_flow (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_oidc_flow_expires_at_idx ON auth_oidc_flow (expires_at);
