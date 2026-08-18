import { randomUUID } from "node:crypto";
import type { DatabasePool } from "@docker-image-builder-system/db";
import type { Principal } from "./principal.js";
import type { OidcFlowState, SessionRecord, SessionStore } from "./session-store.js";

/** PostgreSQL-backed production session store. */
export class PostgresSessionStore implements SessionStore {
  constructor(private readonly pool: DatabasePool) {}

  async createSession(principal: Principal, ttlSeconds: number): Promise<SessionRecord> {
    const id = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    await this.pool.query(
      "INSERT INTO auth_session (id, subject, roles, expires_at) VALUES ($1, $2, $3::jsonb, $4)",
      [id, principal.subject, JSON.stringify(principal.roles), expiresAt]
    );
    return { id, principal, expiresAt };
  }

  async getSession(id: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      "SELECT id, subject, roles, expires_at FROM auth_session WHERE id = $1 AND expires_at > $2",
      [id, nowSeconds]
    );
    const row = result.rows[0] as { id?: string; subject?: string; roles?: unknown; expires_at?: number | string } | undefined;
    if (!row?.id || !row.subject || !Number.isFinite(Number(row.expires_at))) return null;
    const roles = Array.isArray(row.roles)
      ? row.roles.filter((role): role is string => typeof role === "string")
      : [];
    return {
      id: row.id,
      principal: { subject: row.subject, roles, expiresAt: Number(row.expires_at) },
      expiresAt: Number(row.expires_at)
    };
  }

  async revokeSession(id: string): Promise<void> {
    await this.pool.query("DELETE FROM auth_session WHERE id = $1", [id]);
  }

  async saveOidcFlow(state: OidcFlowState): Promise<void> {
    await this.pool.query(
      "INSERT INTO auth_oidc_flow (state, nonce, code_verifier, return_to, expires_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (state) DO UPDATE SET nonce = EXCLUDED.nonce, code_verifier = EXCLUDED.code_verifier, return_to = EXCLUDED.return_to, expires_at = EXCLUDED.expires_at",
      [state.state, state.nonce, state.codeVerifier, state.returnTo, state.expiresAt]
    );
  }

  async consumeOidcFlow(state: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<OidcFlowState | null> {
    const result = await this.pool.query(
      "DELETE FROM auth_oidc_flow WHERE state = $1 AND expires_at > $2 RETURNING state, nonce, code_verifier, return_to, expires_at",
      [state, nowSeconds]
    );
    const row = result.rows[0] as { state?: string; nonce?: string; code_verifier?: string; return_to?: string; expires_at?: number | string } | undefined;
    if (!row?.state || !row.nonce || !row.code_verifier || !row.return_to || !Number.isFinite(Number(row.expires_at))) return null;
    return {
      state: row.state,
      nonce: row.nonce,
      codeVerifier: row.code_verifier,
      returnTo: row.return_to,
      expiresAt: Number(row.expires_at)
    };
  }
}
