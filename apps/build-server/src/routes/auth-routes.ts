// Phase 1 (Identity + 테넌트 권한) + Phase 2 (Runner 인증) 인증 라우트.
//
// endpoint 5종:
//   - POST /auth/login            — subject + role 로 토큰 발급 (HMAC 서명).
//   - POST /auth/logout           — 현재 principal 의 jti 를 revoke.
//   - GET  /auth/whoami           — 현재 principal 을 그대로 echo.
//   - POST /auth/runner-login     — Runner lease 토큰 발급 (subject=runner:<id>,
//                                    role=runner, TTL 짧음).
//   - POST /auth/runner-lease-renew — Runner 가 만료 전 lease 갱신.
//
// admin role 발급은 별도 admin allow-list 검증 통과가 필요하다. 토큰 payload
// 의 role 은 client 가 신뢰할 값이 아니라 server 가 결정한다 — 클라이언트가
// role=admin 으로 요청해도 admin allow-list 에 없으면 403.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authLoginRequestSchema,
  authLoginResponseSchema,
  runnerLeaseResponseSchema,
  runnerLoginRequestSchema,
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
  buildService: import("../services/build-service.js").BuildService,
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

  // ---------------------------------------------------------------------
  // Phase 2 (Runner 인증) — lease token 발급 / 갱신
  // ---------------------------------------------------------------------

  const leaseTtlSeconds = (() => {
    const raw = process.env.RUNNER_LEASE_TTL_SECONDS?.trim();
    if (!raw) return 300; // default 5 min
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 300;
  })();

  // BuildService 의 runnerAllowList 검증은 BuildService 가 아니라 repository 의
  // getRunnerStatus 로 위임 — runner 가 unknown 이면 undefined (401 reject).
  // 별도 BuildService 의 getRunnerStatus 메서드 사용.

  app.post("/auth/runner-login", async (request, reply) => {
    const parsed = runnerLoginRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid runner login payload.",
        issues: parsed.error.issues
      });
    }
    const { runnerId } = parsed.data;
    const status = await buildService.getRunnerStatus(runnerId);
    if (status === undefined || status === null) {
      // unknown runner — self-register 가 발생할 첫 claim 시점에 동일 runnerId
      // 로 claim 하면 Build Server 가 runner record 를 생성하므로 login 만으로는
      // 등록을 강제하지 않는다. 운영자가 명시적으로 등록하려면 POST /admin/runners.
      return reply.status(401).send({
        message: "Runner is not registered.",
        runnerId
      });
    }
    if (status === "DISABLED") {
      return reply.status(403).send({
        message: "Runner is disabled by admin.",
        runnerId
      });
    }
    // subject 형식: `<runnerId>` — build-scoped API 의 lease 검증이
    // principal.role === "runner" 으로 식별한다. subject 에 `runner:` prefix
    // 를 붙이면 HmacIdentityProvider 의 forbidden char (`:`) 와 충돌하므로
    // prefix 없이 raw runnerId 만 사용.
    const issued = await identityProvider.issueWithExpiresAt(
      runnerId,
      "runner",
      leaseTtlSeconds
    );
    const body = runnerLeaseResponseSchema.parse({
      leaseToken: issued.token,
      expiresAt: issued.principal.expiresAt,
      runnerId
    });
    return reply.status(200).send(body);
  });

  app.post("/auth/runner-lease-renew", async (request, reply) => {
    await ensurePrincipalInline(request);
    if (!request.principal) {
      return reply.status(401).send({
        message: "Authentication required.",
        hint: "POST /auth/runner-login to obtain a lease token."
      });
    }
    if (request.principal.role !== "runner") {
      return reply.status(403).send({
        message: "Caller is not a runner.",
        callerId: request.principal.subject
      });
    }
    // subject === runnerId (raw). prefix 슬라이스 불요.
    const runnerId = request.principal.subject;
    // DISABLED 된 runner 의 lease 갱신은 거절 — admin 이 disable 한 runner 가
    // stale lease 로 build 활동하는 결함 방지.
    const status = await buildService.getRunnerStatus(runnerId);
    if (status === undefined || status === null) {
      return reply.status(401).send({
        message: "Runner is not registered.",
        runnerId
      });
    }
    if (status === "DISABLED") {
      return reply.status(403).send({
        message: "Runner is disabled by admin.",
        runnerId
      });
    }
    // 동일 subject + role + 새 ttl 로 재발급. jti 갱신 (이전 lease 는 자연 만료).
    const renewed = await identityProvider.issueWithExpiresAt(
      request.principal.subject,
      "runner",
      leaseTtlSeconds
    );
    // 기존 jti revoke — stale client 가 같은 lease 를 재사용하지 못하도록.
    await identityProvider.revoke(request.principal.jti);
    const body = runnerLeaseResponseSchema.parse({
      leaseToken: renewed.token,
      expiresAt: renewed.principal.expiresAt,
      runnerId
    });
    return reply.status(200).send(body);
  });
}