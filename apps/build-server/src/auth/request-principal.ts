// Fastify decorator + preHandler hook.
//
// Phase 1 의 서버 진입점. `request.principal` 을 모든 라우트 진입 직전에
// 채운다. 값이 null 이면 미인증 — 라우트 핸들러가 명시적으로 거부하거나
// preHandler 가 거부한다.
//
// 추출 우선순위:
//   1) `Cookie: auth_token=...` 헤더
//   2) `Authorization: Bearer ...` 헤더
//
// 두 곳 모두 없거나 verify 실패 시 principal 은 null.

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Principal } from "@docker-image-builder-system/shared-contract";

import type { IdentityProvider } from "./identity-provider.js";

declare module "fastify" {
  interface FastifyRequest {
    /** 인증된 principal. 미인증이면 null. */
    principal: Principal | null;
  }
}

/** cookie 이름. auth-routes.ts 의 Set-Cookie 와 정합해야 한다. */
export const AUTH_COOKIE_NAME = "auth_token";

function parseCookies(headerValue: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (typeof headerValue !== "string" || headerValue.length === 0) return cookies;
  for (const piece of headerValue.split(";")) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (name && value) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

function extractToken(request: FastifyRequest): string | null {
  // 1) Cookie 우선 — same-origin SPA 가 default.
  const cookies = parseCookies(request.headers.cookie);
  const fromCookie = cookies.get(AUTH_COOKIE_NAME);
  if (fromCookie) return fromCookie;

  // 2) Authorization: Bearer — CLI / programmatic caller.
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.length > 0) {
    const match = /^Bearer\s+(.+)$/.exec(authHeader);
    if (match && match[1]) return match[1].trim();
  }

  return null;
}

/** preHandler hook — request.principal 을 채운다. */
export async function registerPrincipalPreHandler(
  app: FastifyInstance,
  identityProvider: IdentityProvider
): Promise<void> {
  app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => {
    const token = extractToken(request);
    if (!token) {
      request.principal = null;
      return;
    }
    request.principal = await identityProvider.verify(token);
  });
}