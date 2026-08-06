// Phase 1 (Identity + 테넌트 권한) 인증 라우트.
//
// 세 가지 endpoint 를 노출한다:
//   - POST /auth/login  — subject + role 로 토큰 발급 (HMAC 서명).
//   - POST /auth/logout — 현재 principal 의 jti 를 revoke.
//   - GET  /auth/whoami — 현재 principal 을 그대로 echo.
//
// admin role 발급은 별도 admin allow-list 검증 통과가 필요하다. 토큰 payload
// 의 role 은 client 가 신뢰할 값이 아니라 server 가 결정한다 — 클라이언트가
// role=admin 으로 요청해도 admin allow-list 에 없으면 403.

import type { FastifyInstance } from "fastify";
import {
  authLoginRequestSchema,
  authLoginResponseSchema,
  whoAmIResponseSchema,
  type PrincipalRole
} from "@docker-image-builder-system/shared-contract";

import { AUTH_COOKIE_NAME } from "../auth/request-principal.js";
import type { IdentityProvider } from "../auth/identity-provider.js";
import type { AdminAllowList } from "./admin-routes.js";

export interface RegisterAuthRoutesOptions {
  /** 운영자가 명시적으로 X-Admin-Id 헤더 호환을 켰을 때만 true. default false. */
  readonly legacyHeadersEnabled?: boolean;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  identityProvider: IdentityProvider,
  adminAllowList: AdminAllowList,
  options: RegisterAuthRoutesOptions = {}
): Promise<void> {
  void options;

  const setAuthCookie = (reply: import("fastify").FastifyReply, token: string, maxAgeSeconds: number): void => {
    const isHttps = process.env.NODE_ENV === "production";
    const value = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isHttps ? "; Secure" : ""}`;
    reply.header("Set-Cookie", value);
  };

  // registerPrincipalPreHandler 가 호출되지 않은 단위 테스트 환경에서도
  // 동작하도록, 라우트 진입 시점에 cookie/bearer 를 직접 추출해 principal 을
  // 보강한다. registerPrincipalPreHandler 가 이미 등록된 환경에선
  // request.principal 이 이미 채워져 있으므로 skip.
  const ensurePrincipalInline = async (request: import("fastify").FastifyRequest): Promise<void> => {
    if (request.principal) return;
    const cookieHeader = request.headers.cookie;
    let token: string | null = null;
    if (typeof cookieHeader === "string" && cookieHeader.length > 0) {
      for (const piece of cookieHeader.split(";")) {
        const eq = piece.trim().indexOf("=");
        if (eq > 0 && piece.trim().slice(0, eq) === AUTH_COOKIE_NAME) {
          token = decodeURIComponent(piece.trim().slice(eq + 1));
          break;
        }
      }
    }
    if (!token) {
      const authHeader = request.headers.authorization;
      if (typeof authHeader === "string") {
        const m = /^Bearer\s+(.+)$/.exec(authHeader);
        if (m && m[1]) token = m[1].trim();
      }
    }
    if (!token) return;
    request.principal = await identityProvider.verify(token);
  };

  app.post("/auth/login", async (request, reply) => {
    const parsed = authLoginRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid login payload.",
        issues: parsed.error.issues
      });
    }
    const { subject, role } = parsed.data;
    const requestedRole: PrincipalRole = role ?? "user";

    // admin role 요청은 allow-list 검증 필수. 위반 시 403.
    if (requestedRole === "admin" && !adminAllowList.contains(subject)) {
      return reply.status(403).send({
        message: "Subject is not in the admin allow-list.",
        subject
      });
    }

    const issued = await identityProvider.issue(subject, requestedRole);
    setAuthCookie(reply, issued.token, issued.maxAgeSeconds);

    const responseBody = authLoginResponseSchema.parse(issued.principal);
    return reply.status(200).send(responseBody);
  });

  app.post("/auth/logout", async (request, reply) => {
    await ensurePrincipalInline(request);
    if (request.principal) {
      await identityProvider.revoke(request.principal.jti);
    }
    // token 이 없거나 변조된 경우에도 cookie 만료 + 204. best-effort logout.
    setAuthCookie(reply, "", 0);
    return reply.status(204).send();
  });

  app.get("/auth/whoami", async (request, reply) => {
    await ensurePrincipalInline(request);
    if (!request.principal) {
      return reply.status(401).send({ message: "Authentication required." });
    }
    const body = whoAmIResponseSchema.parse(request.principal);
    return reply.status(200).send(body);
  });

  // 운영자가 명시적으로 켜지 않는 한 legacy header 무시는 silent — 본 TASK 의
  // 정책은 default OFF 이므로 별도 경고 emit 없음.
}