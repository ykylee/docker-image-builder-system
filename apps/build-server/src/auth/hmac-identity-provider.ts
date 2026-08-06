// HMAC-SHA256 서명 기반 IdentityProvider 구현.
//
// Phase 1 의 1차 구현이다. 외부 IdP (OIDC/SAML) 의존 없이 동일한 보안
// 효과를 내는 가장 가벼운 옵션이다. 형식과 검증은 OpenAPI security scheme
// (`cookieAuth: apiKey, cookie, auth_token`) 과 정합한다.
//
// 보안 결정:
//   - AUTH_HMAC_SECRET 은 필수 env. 부재 시 boot fail. dev/local default 는
//     `dev-only-secret-change-me-in-production` — production 은 secret manager.
//   - subject/role/jti 콜론 충돌 회피: 검증 시 payload 를 5-segment 로 split
//     하고, subject/role 이 ":" 를 포함하면 reject.
//   - jti 는 crypto.randomUUID (RFC 4122). 충돌 확률은 사실상 0.
//   - revocation 은 메모리 Set. server 재시작 시 소실. 영속 revoke 가
//     필요해지면 postgres revoke table + follow-up TASK.
//
// 설계 노트:
//   - 토큰은 base64 가 아닌 plain utf-8 사용. opaque string 이라 가독성/
//     디버깅성을 우선시. payload 가 작아 size 차이는 무시 가능.
//   - issue/verify 는 deterministic — IdP 가 분산된 경우 (multi-replica)
//     동일 secret + 동일 payload 가 같은 signature 를 내야 한다. 단일
//     process 가정으로 운영한다 (Phase 3 의 multi-replica 도입 시 검토).

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Principal, PrincipalRole } from "@docker-image-builder-system/shared-contract";

import type { IdentityProvider, IssuedToken } from "./identity-provider.js";

/** Wire 형식 버전. 형식 변경 시 bump 하고 구 reader 가 거부하도록 한다. */
const SCHEME_VERSION = "v1";

/** 기본 TTL 8시간. 운영 가이드 + tests 에서 env 로 조정 가능. */
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

/** subject/role 의 콜론 충돌 회피 — 형식상 ":" 불가. */
const FORBIDDEN_IN_SUBJECT = /:/;

export interface HmacIdentityProviderOptions {
  /** HMAC 서명 키. 비어있으면 dev default. 운영에선 명시 secret 필수. */
  readonly secret: string;
  /** TTL seconds. 미지정 시 8h. */
  readonly ttlSeconds?: number;
  /** 운영자가 secret 누락으로 boot fail 시키지 않고 dev default 를 허용할지. */
  readonly allowDevDefault?: boolean;
}

export class HmacIdentityProvider implements IdentityProvider {
  readonly #secret: Buffer;
  readonly #ttlSeconds: number;
  readonly #revokedJtis = new Set<string>();
  /** 발급 시점 추적 (메트릭). revoke 되어도 size 만 감소. */
  #issuedCount = 0;

  constructor(options: HmacIdentityProviderOptions) {
    const secret = options.secret;
    if (!secret) {
      if (options.allowDevDefault) {
        this.#secret = Buffer.from("dev-only-secret-change-me-in-production", "utf-8");
      } else {
        throw new Error(
          "HmacIdentityProvider: AUTH_HMAC_SECRET is required. Set it to a non-empty string (>= 32 bytes recommended)."
        );
      }
    } else {
      this.#secret = Buffer.from(secret, "utf-8");
    }
    this.#ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async issue(subject: string, role: PrincipalRole): Promise<IssuedToken> {
    if (!subject || FORBIDDEN_IN_SUBJECT.test(subject)) {
      throw new Error(
        `HmacIdentityProvider.issue: subject must be non-empty and must not contain ":" (got ${JSON.stringify(subject)})`
      );
    }
    if (role !== "user" && role !== "admin") {
      throw new Error(
        `HmacIdentityProvider.issue: role must be "user" or "admin" (got ${JSON.stringify(role)})`
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.#ttlSeconds;
    const jti = randomUUID();
    const payload = `${subject}:${role}:${expiresAt}:${jti}`;
    const signature = createHmac("sha256", this.#secret)
      .update(payload, "utf-8")
      .digest("hex");
    const token = `${SCHEME_VERSION}.${payload}.${signature}`;
    this.#issuedCount += 1;
    return {
      token,
      principal: { subject, role, expiresAt, jti },
      maxAgeSeconds: this.#ttlSeconds
    };
  }

  async verify(token: string): Promise<Principal | null> {
    if (typeof token !== "string" || token.length === 0) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [version, payload, providedSignature] = parts as [string, string, string];
    if (version !== SCHEME_VERSION) return null;
    if (!payload || !providedSignature) return null;

    const expectedSignature = createHmac("sha256", this.#secret)
      .update(payload, "utf-8")
      .digest("hex");

    // 길이 다르면 timingSafeEqual 가 throw 하므로 먼저 가드.
    if (providedSignature.length !== expectedSignature.length) return null;

    let sigMatches = false;
    try {
      sigMatches = timingSafeEqual(
        Buffer.from(providedSignature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      return null;
    }
    if (!sigMatches) return null;

    // payload 검증 — 4-segment split + 콜론 포함 subject 차단.
    const segments = payload.split(":");
    if (segments.length !== 4) return null;
    const [subject, roleRaw, expiryRaw, jti] = segments as [string, string, string, string];
    if (!subject || !jti) return null;
    if (roleRaw !== "user" && roleRaw !== "admin") return null;
    const expiresAt = Number.parseInt(expiryRaw, 10);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) return null;

    if (this.#revokedJtis.has(jti)) return null;

    return {
      subject,
      role: roleRaw,
      expiresAt,
      jti
    };
  }

  async revoke(jti: string): Promise<void> {
    if (typeof jti === "string" && jti.length > 0) {
      this.#revokedJtis.add(jti);
    }
  }

  async revokeAll(): Promise<void> {
    this.#revokedJtis.clear();
  }

  activeCount(): number {
    return this.#issuedCount;
  }

  revokedCount(): number {
    return this.#revokedJtis.size;
  }
}