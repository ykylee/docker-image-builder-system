// Phase 1 (Identity + 테넌트 권한) — 인증 계약.
//
// 본 모듈은 build-server + build-monitor 양쪽이 import 한다.
// 토큰 발급/검증 로직은 server 의 `apps/build-server/src/auth/` 에 있지만,
// principal schema + login/logout/whoami request/response shape 는
// client 가 type-safe 하게 사용하기 위해 shared-contract 에 둔다.
//
// 보안 결정:
//   - 토큰 payload 는 본 모듈에 노출하지 않는다 (server 내부 형식).
//   - client 는 인증 여부만 알면 되며, 토큰 본문은 다루지 않는다.
//   - role 은 두 값만: "user" / "admin". 새 role 추가 시 본 모듈 + server
//     identity-provider 양쪽에 동시 추가.

import { z } from "zod";

/**
 * Principal role. 서버가 부여하며 client 는 표식만 사용한다.
 * "admin" 은 서버에서 별도 admin allow-list 검증 통과 후에만 발급된다.
 */
export const principalRoleSchema = z.enum(["user", "admin", "runner"]);
export type PrincipalRole = z.infer<typeof principalRoleSchema>;

/**
 * Server 가 발급한 principal 의 client 측 표현. cookie / Authorization
 * 헤더로 운반되지만 client 에서는 subject + role 만 다룬다.
 */
export const principalSchema = z.object({
  subject: z.string().min(1).meta({
    description:
      "Canonical owner key. BuildRequest.requestedBy 와 같은 IDENTITY_MODEL."
  }),
  role: principalRoleSchema,
  expiresAt: z.number().int().positive().meta({
    description: "Unix epoch seconds. server now() > expiresAt 이면 401."
  }),
  jti: z.string().min(1).meta({
    description:
      "Token id. logout 시 server 가 메모리 revoke Set 에 등록."
  })
});
export type Principal = z.infer<typeof principalSchema>;

/**
 * POST /auth/login request body.
 * - subject: 사용자가 로그인 폼에 입력한 id (BuildRequest.requestedBy 와 동일).
 * - role: 생략 시 "user". "admin" 으로 로그인 시 server 가 admin allow-list 검증.
 */
export const authLoginRequestSchema = z.object({
  subject: z
    .string()
    .min(1)
    .max(128)
    .meta({ description: "Owner id to authenticate as." }),
  role: principalRoleSchema
    .optional()
    .meta({ description: "Requested role. omit = user. admin 시 allow-list 검증." })
});
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;

/**
 * POST /auth/login response. 서버는 같은 응답으로 Set-Cookie 헤더도 발급한다.
 */
export const authLoginResponseSchema = principalSchema;
export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;

/**
 * GET /auth/whoami response. 미인증 시 401.
 */
export const whoAmIResponseSchema = principalSchema;
export type WhoAmIResponse = z.infer<typeof whoAmIResponseSchema>;

// ---------------------------------------------------------------------------
// Phase 2 (Runner 인증) — lease token.
//
// Runner 가 claim / phase / container-test / deployment API 를 호출할 때마다
// Authorization: Bearer <leaseToken> 헤더를 첨부한다. lease token 은 짧은
// TTL (기본 5분, RUNNER_LEASE_TTL_SECONDS env) 로 발급되며 만료 60초 전에
// 갱신한다. 만료된 lease 는 401 reject — 운영자가 stale runner 의 build
// 활동을 강제로 정지시킬 수 있다.
// ---------------------------------------------------------------------------

/**
 * POST /auth/runner-login request body.
 *
 * Runner 가 자기 신원 (RUNNER_ID env 와 일치) 을 선언하며 lease token 발급
 * 요청. Build Server 가 runnerId 의 allow-list 검증 통과 + status=ACTIVE
 * 확인 후 lease token 발급.
 */
export const runnerLoginRequestSchema = z
  .object({
    runnerId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .meta({
        description:
          "Canonical runner id. Matches RUNNER_ID env on the runner process. Self-registers on first claim (TASK-069) — runner 가 unknown 이면 401."
      })
  })
  .strict()
  .meta({
    id: "RunnerLoginRequest",
    description:
      "Request body for POST /auth/runner-login. RUNNER_HMAC_SECRET 가 build-server 측에 셋업되어 있어야 하며, 동일 secret 이 runner 측 환경에도 있어야 한다."
  });

export type RunnerLoginRequest = z.infer<typeof runnerLoginRequestSchema>;

/**
 * POST /auth/runner-login response + POST /auth/runner-lease-renew response.
 *
 * `leaseToken` 을 claim 응답 + 매 build-scoped API 호출에 첨부. lease 만료
 * 전 runner 가 갱신 endpoint 호출 → 새 leaseToken 발급 (subject + role 유지,
 * jti + expiresAt 갱신).
 */
export const runnerLeaseResponseSchema = z
  .object({
    leaseToken: z.string().min(1).meta({
      description:
        "HMAC v2 형식 lease token (v2.<base64url>.<base64url>). claim 응답 + 매 build-scoped API 호출의 Authorization: Bearer 헤더 값."
    }),
    expiresAt: z.number().int().positive().meta({
      description:
        "Unix epoch seconds. lease 만료 시각. 만료 60초 전에 runner 가 /auth/runner-lease-renew 호출 권장."
    }),
    runnerId: z.string().min(1).meta({
      description: "Echo of the request runnerId."
    })
  })
  .meta({
    id: "RunnerLeaseResponse",
    description:
      "Response body for POST /auth/runner-login and POST /auth/runner-lease-renew."
  });

export type RunnerLeaseResponse = z.infer<typeof runnerLeaseResponseSchema>;