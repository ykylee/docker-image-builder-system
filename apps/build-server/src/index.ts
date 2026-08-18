import { parseRuntimeEnv, toRuntimeSettings } from "@docker-image-builder-system/shared-config";
import { createDbPool } from "@docker-image-builder-system/db";

import { createApp } from "./app/create-app.js";
import { OidcClient } from "./auth/oidc-client.js";
import { PostgresSessionStore } from "./auth/postgres-session-store.js";

async function main(): Promise<void> {
  const env = parseRuntimeEnv(process.env);
  const runtime = toRuntimeSettings(env);
  if (runtime.authMode === "oidc") {
    if (runtime.buildRepositoryBackend !== "postgres") {
      throw new Error("AUTH_MODE=oidc requires BUILD_REPOSITORY_BACKEND=postgres.");
    }
    if (!runtime.oidcIssuerUrl || !runtime.oidcClientId || !runtime.oidcClientSecret || !runtime.oidcRedirectUri) {
      throw new Error("AUTH_MODE=oidc requires OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI.");
    }
    const sessionPool = createDbPool(runtime.databaseUrl);
    const sessionStore = new PostgresSessionStore(sessionPool);
    const oidcClient = new OidcClient({
      issuerUrl: runtime.oidcIssuerUrl,
      clientId: runtime.oidcClientId,
      clientSecret: runtime.oidcClientSecret,
      redirectUri: runtime.oidcRedirectUri,
      scopes: runtime.oidcScopes,
      roleClaim: runtime.oidcRoleClaim
    });
    const app = await createApp(runtime, {
      oidc: {
        client: oidcClient,
        store: sessionStore,
        cookieName: runtime.sessionCookieName,
        cookieSecure: runtime.sessionCookieSecure,
        sessionTtlSeconds: runtime.sessionTtlSeconds
      }
    });
    app.addHook("onClose", async () => sessionPool.end());
    await app.listen({ port: runtime.port, host: "0.0.0.0" });
    return;
  }
  const app = await createApp(runtime);

  await app.listen({
    port: runtime.port,
    host: "0.0.0.0"
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
