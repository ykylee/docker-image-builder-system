# TASK-185 — OIDC/httpOnly session contract

## Requirements summary

현재 HMAC Bearer 경계는 유지하되, 브라우저가 access token이나 caller identity header를 보관·전송하지 않는 운영 인증 경로를 정의한다. 공개 build 등록과 source upload는 계속 anonymous로 허용하고, build 조회·관리자·Runner 제어 API만 검증된 principal을 요구한다.

## 결정안 (ADR)

### Decision

동일 origin의 Build Server를 OIDC relying party + BFF session endpoint로 사용한다. 브라우저는 OIDC authorization-code + PKCE를 시작하고 callback에서만 서버가 code를 교환한다. 서버는 검증된 OIDC claims를 server-side session store에 저장하고, 브라우저에는 불투명한 `dib_session` cookie만 발급한다.

HTTP auth hook은 `SessionAdapter.verifyRequest({ authorization, cookie })`를 호출한다. 운영 adapter는 cookie session을 우선 확인하고, Runner/automation 호환을 위해 HMAC Bearer adapter를 별도 구성으로 유지한다. route는 인증 방식이나 issuer를 직접 알지 않는다.

### Drivers

1. browser storage의 Bearer token 탈취 면적을 제거한다.
2. 공개 제출 경계와 tenant owner/admin policy를 변경하지 않는다.
3. OIDC 교체와 현재 Runner HMAC 인증을 동시에 운영할 수 있어야 한다.

### Alternatives considered

- 브라우저가 OIDC access token을 받아 Authorization으로 전달: 구현은 단순하지만 XSS·storage 유출 시 API token이 직접 노출되어 운영 beta의 목표와 맞지 않는다.
- Build Server가 매 요청마다 OIDC JWT를 검증하는 stateless cookie: 별도 session store는 없지만 cookie 암호화/회전·폐기와 callback state 관리가 복잡하고 즉시 logout/revocation이 어렵다.
- 외부 API gateway/BFF를 별도 배포: 경계는 명확하지만 현재 단일 Build Server 배포 모델에 인프라와 라우팅 변경을 추가한다.

### Consequences

- Redis/Postgres 등 server-side session store와 session TTL/폐기 API가 필요하다.
- auth hook은 비동기 검증을 지원해야 하며, 기존 HMAC adapter도 동일 인터페이스로 감싼다.
- same-origin 운영을 기본으로 하고, cross-origin 배포 시 명시적인 CORS와 cookie 정책 검토가 필요하다.

## Contract

### OIDC configuration

- `OIDC_ISSUER_URL` required in OIDC mode; discovery는 issuer의 `/.well-known/openid-configuration`을 사용한다.
- `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`는 서버 secret store에서만 읽는다.
- `OIDC_REDIRECT_URI`는 allowlisted absolute URL이며 callback의 `redirect_uri`와 exact match한다.
- `OIDC_SCOPES` default: `openid profile email`.
- `SESSION_COOKIE_NAME` default: `dib_session`; `SESSION_TTL_SECONDS` default: 28,800.
- `AUTH_MODE`는 `legacy | required | oidc`로 확장하되, `oidc`는 issuer/client/cookie store 미설정 시 기동 실패한다.

### Browser endpoints

- `GET /auth/login?returnTo=/builds`: state, nonce, PKCE verifier를 server-side transient store에 저장하고 IdP authorize URL로 302. `returnTo`는 same-origin relative path만 허용한다.
- `GET /auth/callback?code=...&state=...`: state/PKCE 검증 → token endpoint code exchange → issuer, signature/JWKS, audience, nonce, `exp` 검증 → session 생성 → `Set-Cookie: dib_session=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<ttl>` → validated returnTo로 303.
- `POST /auth/logout`: session revoke/delete, `Set-Cookie: dib_session=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`. CSRF 방지를 위해 same-origin 요청과 `Origin` 검사를 적용한다.
- `GET /auth/session`: UI bootstrap용 `{ authenticated, subject?, roles? }`만 반환하며 access/refresh token과 raw claims는 반환하지 않는다.

### Build Server adapter interface

```ts
type SessionRequest = {
  authorization?: unknown;
  cookie?: string;
};

interface SessionAdapter {
  readonly kind: "hmac" | "oidc" | "composite";
  verifyRequest(input: SessionRequest): Promise<Principal | null>;
  revoke?(sessionCookie: string): Promise<void>;
}
```

`Principal`은 기존 `{ subject, roles, expiresAt }`로 normalize한다. OIDC `sub`를 canonical subject로 사용하고, admin role mapping은 allowlisted claim/path 설정으로만 부여한다. email/name은 owner identity로 사용하지 않는다.

### React migration

- `getAccessToken`, `setAccessToken`, `sessionStorage/localStorage` token bridge 제거.
- `withAuthHeaders`는 identity header와 Authorization을 모두 추가하지 않고 browser cookie 자동 전송에 의존한다.
- 앱 bootstrap에서 `GET /auth/session`을 호출하고 `authenticated=false`면 `/login`으로 이동한다.
- logout은 `POST /auth/logout` 후 local user display state만 정리한다.
- Runner와 non-browser API clients는 OIDC cookie가 아니라 기존 HMAC Bearer를 계속 사용한다.

## Implementation steps

1. `apps/build-server/src/auth/session-adapter.ts`: request/cookie 기반 async interface, HMAC adapter wrapper, composite precedence를 추가한다.
2. `apps/build-server/src/auth/oidc-session.ts`: discovery/JWKS cache, authorization-code PKCE, transient state, session store adapter와 claim normalization을 구현한다.
3. `apps/build-server/src/app/create-app.ts`: `/auth/*` routes, cookie parsing, async auth hook, `AUTH_MODE=oidc` validation을 연결한다.
4. `packages/shared-config`: OIDC/session env schema와 secret redaction을 추가한다.
5. `apps/build-monitor/react`: session bootstrap/login redirect/logout 및 token storage 제거를 구현한다.
6. OpenAPI/docs/PROJECT_PROFILE에 endpoint, cookie, role mapping, rotation/revocation 운영 절차를 반영한다.

## Acceptance criteria

- OIDC callback은 잘못된 state, nonce, issuer, audience, signature, expired claim을 모두 거부한다.
- `Set-Cookie`에는 `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, bounded `Max-Age`가 포함되고 token endpoint 응답이 browser로 전달되지 않는다.
- 보호 API는 유효한 session cookie에서만 principal을 만들며 caller `X-User-Id`/`X-Admin-Id`는 무시한다.
- `/auth/logout` 이후 같은 cookie의 보호 API 요청은 401이다.
- `POST /builds`와 source upload는 OIDC session 없이도 계속 성공한다.
- HMAC Runner bearer 회귀 테스트와 tenant owner/admin policy 테스트가 계속 통과한다.
- React 번들/네트워크 검사에서 access token을 `localStorage`/`sessionStorage`에 쓰거나 `Authorization`으로 전송하지 않는다.

## Verification plan

- Unit: PKCE/state/nonce, JWKS rotation/cache, claim mapping, cookie serializer, session TTL.
- Integration: callback → cookie → protected API → logout lifecycle with fake OIDC provider and in-memory session store.
- E2E: public intake, user owner isolation, admin allowlist, refresh, expired session, cross-site callback rejection.
- Observability: login/callback/logout/session reject reason metrics; token/claims/cookie value redaction assertions in logs.

## Pre-mortem

1. Cookie가 reverse proxy에서 Secure 조건을 만족하지 않아 로그인 직후 세션이 사라짐 → production-like HTTPS proxy E2E와 `trustProxy` 설정 검증.
2. OIDC group/role claim drift로 일반 사용자가 admin이 됨 → default-deny role mapping과 provider-specific mapping config 테스트.
3. session store 장애가 보호 API를 legacy 허용으로 우회시킴 → `AUTH_MODE=oidc`에서는 store 오류를 503으로 fail-closed하고 readiness에 dependency 상태 반영.

## Follow-ups

- 실제 IdP(issuer, group claim, redirect origin) 선택 후 provider-specific mapping 확정.
- Redis/Postgres session store 선택과 HA/rotation 정책 결정.
- CSRF token 전략을 cookie-authenticated mutating API 전체에 적용할지 결정.
