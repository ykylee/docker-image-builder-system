import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Principal } from "./principal.js";

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type OidcTokenResponse = {
  id_token?: string;
  access_token?: string;
};

export type OidcFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  authorizationUrl: string;
};

export type OidcClientOptions = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string;
  roleClaim?: string;
  fetchFn?: typeof fetch;
};

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function randomUrlValue(size = 32): string {
  return base64Url(randomBytes(size));
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function issuerDiscoveryUrl(issuerUrl: string): string {
  return `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
}

export class OidcClient {
  private discoveryPromise: Promise<OidcDiscovery> | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: OidcClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async discovery(): Promise<OidcDiscovery> {
    this.discoveryPromise ??= this.fetchDiscovery();
    return this.discoveryPromise;
  }

  async beginLogin(returnTo: string): Promise<OidcFlow> {
    const discovery = await this.discovery();
    const state = randomUrlValue();
    const nonce = randomUrlValue();
    const codeVerifier = randomUrlValue(48);
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", this.options.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.options.scopes ?? "openid profile email");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    // returnTo is persisted in the server-side flow store, never sent as an
    // open redirect URL to the provider.
    void returnTo;
    return { state, nonce, codeVerifier, authorizationUrl: url.toString() };
  }

  async exchangeCode(code: string, flow: { nonce: string; codeVerifier: string }): Promise<Principal> {
    const discovery = await this.discovery();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: this.options.redirectUri,
      code_verifier: flow.codeVerifier
    });
    const response = await this.fetchFn(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(`OIDC token exchange failed (${response.status})`);
    const token = (await response.json()) as OidcTokenResponse;
    if (!token.id_token) throw new Error("OIDC token response did not include id_token");
    const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    const verified = await jwtVerify(token.id_token, jwks, {
      issuer: discovery.issuer,
      audience: this.options.clientId
    });
    if (verified.payload.nonce !== flow.nonce) {
      throw new Error("OIDC id_token nonce mismatch");
    }
    const roleClaim = this.options.roleClaim ?? "roles";
    // Providers such as Keycloak commonly place realm roles in the access
    // token. Keep an ID-token role claim authoritative when present, and only
    // fall back to a separately verified access token when it is empty.
    const idTokenRoles = rolesFromClaims(verified.payload, roleClaim);
    let roles = idTokenRoles;
    if (token.access_token && idTokenRoles.length === 0) {
      const accessToken = await jwtVerify(token.access_token, jwks, {
        issuer: discovery.issuer,
        audience: this.options.clientId
      });
      if (accessToken.payload.sub !== verified.payload.sub) {
        throw new Error("OIDC access_token subject mismatch");
      }
      roles = rolesFromClaims(accessToken.payload, roleClaim);
    }
    return principalFromClaims(verified.payload, roleClaim, roles);
  }

  private async fetchDiscovery(): Promise<OidcDiscovery> {
    const response = await this.fetchFn(issuerDiscoveryUrl(this.options.issuerUrl), {
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
    const discovery = (await response.json()) as OidcDiscovery;
    if (
      discovery.issuer !== this.options.issuerUrl.replace(/\/$/, "") ||
      !discovery.authorization_endpoint ||
      !discovery.token_endpoint ||
      !discovery.jwks_uri
    ) {
      throw new Error("OIDC discovery metadata is incomplete or issuer-mismatched");
    }
    return discovery;
  }
}

function principalFromClaims(claims: JWTPayload, roleClaim = "roles", roles = rolesFromClaims(claims, roleClaim)): Principal {
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.exp !== "number") {
    throw new Error("OIDC id_token is missing sub or exp");
  }
  return { subject: claims.sub, roles, expiresAt: claims.exp };
}

function rolesFromClaims(claims: JWTPayload, roleClaim: string): string[] {
  const value = roleClaim.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, claims);
  const roles = typeof value === "string"
    ? (value.trim() ? [value.trim()] : [])
    : Array.isArray(value)
      ? value.filter((role): role is string => typeof role === "string").map((role) => role.trim()).filter(Boolean)
      : [];
  return roles;
}
