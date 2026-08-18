import { randomUUID } from "node:crypto";
import type { Principal } from "./principal.js";

export type SessionRecord = {
  id: string;
  principal: Principal;
  expiresAt: number;
};

export type OidcFlowState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
};

/**
 * Persistence boundary for opaque browser sessions and short-lived OIDC flow
 * state. Production adapters may use Redis or Postgres; routes must not know
 * which store is selected.
 */
export interface SessionStore {
  createSession(principal: Principal, ttlSeconds: number): Promise<SessionRecord>;
  getSession(id: string, nowSeconds?: number): Promise<SessionRecord | null>;
  revokeSession(id: string): Promise<void>;
  saveOidcFlow(state: OidcFlowState): Promise<void>;
  consumeOidcFlow(state: string, nowSeconds?: number): Promise<OidcFlowState | null>;
}

/** Test/local implementation. Do not use as the production OIDC store. */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly flows = new Map<string, OidcFlowState>();

  async createSession(principal: Principal, ttlSeconds: number): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: randomUUID(),
      principal,
      expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds
    };
    this.sessions.set(record.id, record);
    return record;
  }

  async getSession(id: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<SessionRecord | null> {
    const record = this.sessions.get(id);
    if (!record) return null;
    if (record.expiresAt <= nowSeconds) {
      this.sessions.delete(id);
      return null;
    }
    return record;
  }

  async revokeSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async saveOidcFlow(state: OidcFlowState): Promise<void> {
    this.flows.set(state.state, state);
  }

  async consumeOidcFlow(
    state: string,
    nowSeconds = Math.floor(Date.now() / 1000)
  ): Promise<OidcFlowState | null> {
    const flow = this.flows.get(state);
    this.flows.delete(state);
    if (!flow || flow.expiresAt <= nowSeconds) return null;
    return flow;
  }
}
