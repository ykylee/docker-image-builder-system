// Phase 1 (Identity + 테넌트 권한) — 인증 provider 인터페이스.
//
// `IdentityProvider` 는 build-server 가 principal 을 발급/검증/revoke 하는
// 단일 표면이다. 본 TASK 의 1차 구현은 HmacIdentityProvider 이며,
// 후속 TASK 에서 OidcIdentityProvider / SamlIdentityProvider 가 본 인터페이스를
// 구현해 교체 가능하다.
//
// 모든 메서드는 async — IdP 가 외부 시스템인 경우에도 같은 호출 부위를
// 유지하기 위함. 메모리 구현은 즉시 resolve 해도 무방.

import type { Principal, PrincipalRole } from "@docker-image-builder-system/shared-contract";

/**
 * 발급된 토큰의 wire 형식. client 에는 절대 노출되지 않으며
 * server 내부에서만 cookie 값으로 운반된다.
 *
 * 형식: `v1.<base64url(payload)>.<hex(HMAC-SHA256(payload, secret))>`
 *   - v1: 스키마 버전. 미래 형식 변경 시 식별자.
 *   - payload: `<subject>:<role>:<expiry-epoch>:<jti>` 의 utf-8 bytes.
 *   - signature: payload + secret 의 HMAC-SHA256. hex lowercase.
 *
 * subject/role/expiry-jti 가 콜론을 포함할 수 없도록 정규화한다.
 */
export interface IssuedToken {
  /** Cookie/Authorization 헤더에 실을 토큰 문자열. */
  readonly token: string;
  /** 동일 subject 의 principal. 응답 body 와 cookie 의 meta 로 사용. */
  readonly principal: Principal;
  /** Cookie Max-Age / Set-Cookie 헤더용 seconds. */
  readonly maxAgeSeconds: number;
}

export interface IdentityProvider {
  /**
   * subject + role 로 토큰을 발급한다. role === "admin" 인 경우
   * `isAdminAllowed(subject)` 가 true 여야 한다 — 위반 시 throw.
   * (호출자는 route handler 에서 미리 검증하는 것을 권장한다.)
   */
  issue(subject: string, role: PrincipalRole): Promise<IssuedToken>;

  /**
   * Phase 2 (Runner 인증) — 명시 ttlSeconds 로 토큰 발급. lease token 처럼
   * 짧은 만료가 필요한 경우 사용. verify 결과는 동일 wire format + signature
   * scheme — caller 가 발급 시점의 ttl 만 다름.
   */
  issueWithExpiresAt(
    subject: string,
    role: PrincipalRole,
    ttlSeconds: number
  ): Promise<IssuedToken>;

  /**
   * wire 토큰을 검증해 principal 을 반환한다. 유효하지 않으면 null.
   * - 변조 (signature mismatch): null
   * - 만료 (now > expiresAt): null
   * - revoke (jti 가 revoked Set): null
   */
  verify(token: string): Promise<Principal | null>;

  /**
   * jti 를 revoke Set 에 등록한다. 이후 같은 jti 의 verify 는 null.
   * (logout, admin 강제 로그아웃 등)
   */
  revoke(jti: string): Promise<void>;

  /** 모든 토큰을 무효화. (admin 의 "강제 전체 로그아웃" 기능) */
  revokeAll(): Promise<void>;

  /** 디버그 / 메트릭용. 현재 발급된 토큰 수. */
  activeCount(): number;

  /** 디버그 / 메트릭용. 현재 revoke 된 jti 수. */
  revokedCount(): number;
}