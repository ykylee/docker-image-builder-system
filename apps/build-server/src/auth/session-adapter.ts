import type { Principal } from "./principal.js";
import { bearerToken, verifyPrincipalToken } from "./principal.js";

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

export function createHmacSessionAdapter(secret: string): SessionAdapter {
  return {
    kind: "hmac",
    async verifyRequest(input) {
      return verifyPrincipalToken(bearerToken(input.authorization), secret);
    }
  };
}
