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
export const principalRoleSchema = z.enum(["user", "admin"]);
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