import Fastify from "fastify";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createDbPool } from "@docker-image-builder-system/db";
import { parseRuntimeEnv, toRuntimeSettings } from "@docker-image-builder-system/shared-config";
import { createApp } from "../../src/app/create-app.js";
import { OidcClient } from "../../src/auth/oidc-client.js";
import { MemorySessionStore } from "../../src/auth/session-store.js";
import { PostgresSessionStore } from "../../src/auth/postgres-session-store.js";

const buildServerPort = Number(process.env.OIDC_E2E_PORT ?? 3312);
const databaseUrl = process.env.OIDC_E2E_DATABASE_URL;
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "oidc-e2e-key";
const issuer = Fastify();
let expectedNonce = "";
let expectedCodeChallenge = "";
let issuerOrigin = "";

issuer.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, payload, done) => done(null, payload));
issuer.get("/.well-known/openid-configuration", async (request, reply) => {
  issuerOrigin = `http://${request.headers.host}`;
  return reply.send({ issuer: issuerOrigin, authorization_endpoint: `${issuerOrigin}/authorize`, token_endpoint: `${issuerOrigin}/token`, jwks_uri: `${issuerOrigin}/jwks` });
});
issuer.get("/jwks", async (_request, reply) => reply.send({ keys: [jwk] }));
issuer.get<{ Querystring: { redirect_uri?: string; state?: string; nonce?: string; code_challenge?: string } }>("/authorize", async (request, reply) => {
  expectedNonce = request.query.nonce ?? "";
  expectedCodeChallenge = request.query.code_challenge ?? "";
  const redirect = new URL(request.query.redirect_uri ?? "");
  redirect.searchParams.set("code", "oidc-e2e-code");
  redirect.searchParams.set("state", request.query.state ?? "");
  return reply.redirect(redirect.toString(), 302);
});
issuer.post("/token", async (request, reply) => {
  const body = new URLSearchParams(String(request.body ?? ""));
  if (body.get("code") !== "oidc-e2e-code" || !body.get("code_verifier") || !expectedCodeChallenge) return reply.code(400).send({ error: "invalid_grant" });
  const idToken = await new SignJWT({ sub: "oidc-browser-user", realm_access: { roles: ["user"] }, nonce: expectedNonce })
    .setProtectedHeader({ alg: "RS256", kid: "oidc-e2e-key" })
    .setIssuer(issuerOrigin)
    .setAudience("dib-oidc-e2e")
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(privateKey);
  return reply.send({ id_token: idToken });
});

await issuer.listen({ host: "127.0.0.1", port: 0 });
const issuerAddress = issuer.server.address();
if (!issuerAddress || typeof issuerAddress === "string") throw new Error("OIDC E2E issuer did not bind");
issuerOrigin = `http://127.0.0.1:${issuerAddress.port}`;
// Browser-facing callback stays on the Vite origin; its /auth proxy forwards
// the request to Build Server while preserving the browser's cookie origin.
const redirectUri = "http://localhost:5174/auth/callback";
const runtime = toRuntimeSettings(parseRuntimeEnv({ AUTH_MODE: "oidc", BUILD_REPOSITORY_BACKEND: databaseUrl ? "postgres" : "memory", ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}), DB_AUTO_BOOTSTRAP: "true", ADMIN_IDS: "oidc-browser-admin", OIDC_ISSUER_URL: issuerOrigin, OIDC_CLIENT_ID: "dib-oidc-e2e", OIDC_CLIENT_SECRET: "oidc-e2e-secret", OIDC_REDIRECT_URI: redirectUri, OIDC_ROLE_CLAIM: "realm_access.roles", SESSION_COOKIE_SECURE: "false", CORS_ORIGIN: "false", PORT: String(buildServerPort) }));
const sessionPool = databaseUrl ? createDbPool(databaseUrl) : undefined;
const store = sessionPool ? new PostgresSessionStore(sessionPool) : new MemorySessionStore();
const app = await createApp(runtime, { oidc: { client: new OidcClient({ issuerUrl: issuerOrigin, clientId: "dib-oidc-e2e", clientSecret: "oidc-e2e-secret", redirectUri, roleClaim: "realm_access.roles" }), store, cookieName: runtime.sessionCookieName, cookieSecure: false, sessionTtlSeconds: runtime.sessionTtlSeconds } });
await app.listen({ host: "127.0.0.1", port: buildServerPort });

async function shutdown(): Promise<void> {
  await app.close();
  await sessionPool?.end();
  await issuer.close();
}
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
