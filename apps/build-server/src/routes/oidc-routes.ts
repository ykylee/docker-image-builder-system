import type { FastifyInstance } from "fastify";
import type { OidcClient } from "../auth/oidc-client.js";
import type { SessionStore } from "../auth/session-store.js";

export type OidcRouteOptions = {
  client: OidcClient;
  store: SessionStore;
  cookieName: string;
  sessionTtlSeconds: number;
};

function serializeCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/builds";
  return value;
}

export function registerOidcRoutes(app: FastifyInstance, options: OidcRouteOptions): void {
  app.get<{ Querystring: { returnTo?: string } }>("/auth/login", async (request, reply) => {
    const returnTo = safeReturnTo(request.query.returnTo);
    const flow = await options.client.beginLogin(returnTo);
    await options.store.saveOidcFlow({
      state: flow.state,
      nonce: flow.nonce,
      codeVerifier: flow.codeVerifier,
      returnTo,
      expiresAt: Math.floor(Date.now() / 1000) + 600
    });
    return reply.redirect(flow.authorizationUrl, 302);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/auth/callback", async (request, reply) => {
    if (request.query.error || !request.query.code || !request.query.state) {
      return reply.code(400).send({ message: "OIDC callback was not completed." });
    }
    const flow = await options.store.consumeOidcFlow(request.query.state);
    if (!flow) return reply.code(400).send({ message: "OIDC callback state is invalid or expired." });
    try {
      const principal = await options.client.exchangeCode(request.query.code, flow);
      const session = await options.store.createSession(principal, options.sessionTtlSeconds);
      reply.header("set-cookie", serializeCookie(options.cookieName, session.id, options.sessionTtlSeconds));
      return reply.redirect(flow.returnTo, 303);
    } catch {
      return reply.code(401).send({ message: "OIDC callback verification failed." });
    }
  });

  app.get("/auth/session", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const id = readCookie(request.headers.cookie, options.cookieName);
    const session = id ? await options.store.getSession(id) : null;
    if (!session) return reply.send({ authenticated: false });
    return reply.send({ authenticated: true, subject: session.principal.subject, roles: session.principal.roles });
  });

  app.post("/auth/logout", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      const forwardedProto = request.headers["x-forwarded-proto"];
      const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",", 1)[0] : "http";
      const expectedOrigin = `${protocol}://${request.headers.host}`;
      if (origin !== expectedOrigin) {
        return reply.code(403).send({ message: "Cross-origin logout is not allowed." });
      }
    }
    const id = readCookie(request.headers.cookie, options.cookieName);
    if (id) await options.store.revokeSession(id);
    reply.header("set-cookie", serializeCookie(options.cookieName, "", 0));
    return reply.code(204).send();
  });
}
