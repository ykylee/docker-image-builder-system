import type { Principal } from "./principal.js";
import { bearerToken, verifyPrincipalToken } from "./principal.js";
import type { SessionStore } from "./session-store.js";

/**
 * Authentication boundary consumed by the HTTP layer.
 *
 * The current implementation is HMAC bearer verification. An OIDC or
 * httpOnly-cookie adapter can replace it without changing route guards: the
 * only contract is to turn the incoming Authorization value into a verified
 * principal or null.
 */
export interface SessionAdapter {
  readonly kind: "hmac" | "oidc" | "composite";
  verifyRequest(input: SessionRequest): Promise<Principal | null>;
}

export type SessionRequest = {
  authorization?: unknown;
  cookie?: string;
};

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function createHmacSessionAdapter(secret: string): SessionAdapter {
  return {
    kind: "hmac",
    async verifyRequest(input) {
      return verifyPrincipalToken(bearerToken(input.authorization), secret);
    }
  };
}

export function createOidcSessionAdapter(
  store: SessionStore,
  cookieName = "dib_session"
): SessionAdapter {
  return {
    kind: "oidc",
    async verifyRequest(input) {
      const id = cookieValue(input.cookie, cookieName);
      if (!id) return null;
      return (await store.getSession(id))?.principal ?? null;
    }
  };
}

export function createCompositeSessionAdapter(
  adapters: readonly SessionAdapter[]
): SessionAdapter {
  return {
    kind: "composite",
    async verifyRequest(input) {
      for (const adapter of adapters) {
        const principal = await adapter.verifyRequest(input);
        if (principal) return principal;
      }
      return null;
    }
  };
}
