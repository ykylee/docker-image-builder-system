// HMAC-SHA256 서명 기반 IdentityProvider 구현.
//
// Phase 1 의 1차 구현이다. 외부 IdP (OIDC/SAML) 의존 없이 동일한 보안
// 효과를 내는 가장 가벼운 옵션이다. 형식과 검증은 OpenAPI security scheme
// (`cookieAuth: apiKey, cookie, auth_token`) 과 정합한다.
//
// 보안 결정:
//   - AUTH_HMAC_SECRET 은 필수 env. 부재 시 boot fail. dev/local default 는
//     `dev-only-secret-change-me-in-production` — production 은 secret manager.
//   - subject/role 의 `:` 매직 캐릭터 회피: payload 의 inner separator 와
//     외부 wire format 의 `.` 모두 escape 한다. 3단계 봉인에서 base64url
//     encoding 으로 wire format을 재설계 — subject/role/jti 가 `.` 또는 `:`
//     를 포함해도 payload/signature 의 byte 표현이 base64url-safe chars 만
//     사용하도록 정규화.
//   - jti 는 crypto.randomUUID (RFC 4122). 충돌 확률은 사실상 0.
//   - revocation 은 메모리 Set. server 재시작 시 소실. 영속 revoke 가
//     필요해지면 postgres revoke table + follow-up TASK.
//
// 설계 노트:
//   - wire 형식: `v1.<base64url(payload)>.<base64url(sig)>`.
//     payload = `subject:role:expiresAt:jti` 의 utf-8 bytes.
//     payload + signature 가 base64url-safe chars 만 사용하므로 subject 의
//     `:` `.` 가 wire format 의 segment separator 와 충돌하지 않는다.
//   - 1·2단계의 plain utf-8 wire format 은 subject 가 `.` 를 포함할 때
//     (예: `yky.lee`) split(".") 가 payload 를 더 잘라 sig mismatch 가
//     발생하는 잠복 결함이 있었다. 3단계에서 base64url 로 봉인.
//   - issue/verify 는 deterministic — IdP 가 분산된 경우 (multi-replica)
//     동일 secret + 동일 payload 가 같은 signature 를 내야 한다. 단일
//     process 가정으로 운영한다 (Phase 3 의 multi-replica 도입 시 검토).

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Principal, PrincipalRole } from "@docker-image-builder-system/shared-contract";

import type { IdentityProvider, IssuedToken } from "./identity-provider.js";
import type { PersistentRevokeStore } from "./persistent-revoke-store.js";

/** Wire 형식 버전. 형식 변경 시 bump 하고 구 reader 가 거부하도록 한다. */
const SCHEME_VERSION = "v1";

/** v2 wire format 사용 — base64url-encoded payload + signature. 1·2단계
 *  의 v1 (plain utf-8) 는 subject 의 `.` 와 충돌하므로 v1 토큰은 reject. */
const SCHEME_VERSION_V2 = "v2";

/** 기본 TTL 8시간. 운영 가이드 + tests 에서 env 로 조정 가능. */
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

/** subject 안전성: payload 의 inner separator `:` 는 wire format 의
 *  segment separator `.` 와 무관 (base64url 변환 후) 하지만 inner
 *  segment 자체는 `:` 로 split 하므로 subject 가 `:` 를 포함하면 inner
 *  segment 가 늘어 sig mismatch. 따라서 subject 의 `:` 만 차단. `.` 은
 *  base64url encoding 으로 wire format 안전. */
const FORBIDDEN_IN_SUBJECT = /:/;

export interface HmacIdentityProviderOptions {
  /** HMAC 서명 키. 비어있으면 dev default. 운영에선 명시 secret 필수. */
  readonly secret: string;
  /** TTL seconds. 미지정 시 8h. */
  readonly ttlSeconds?: number;
  /** 운영자가 secret 누락으로 boot fail 시키지 않고 dev default 를 허용할지. */
  readonly allowDevDefault?: boolean;
  /**
   * v0.12.0 follow-up: 영속 revoke store (Postgres). 주입되면 in-memory
   * Set 과 영속 store 양쪽에 동시 기록 + verify 시 양쪽 check. 멀티
   * build-server replica 운영 시 revoke 가 모든 replica 에 즉시 전파.
   * 미주입 시 기존 in-memory only 동작 (legacy / 단위 테스트).
   */
  readonly persistentRevokeStore?: PersistentRevokeStore;
}

export class HmacIdentityProvider implements IdentityProvider {
  readonly #secret: Buffer;
  readonly #ttlSeconds: number;
  readonly #revokedJtis = new Set<string>();
  /** 발급 시점 추적 (메트릭). revoke 되어도 size 만 감소. */
  #issuedCount = 0;
  /**
   * v0.12.0 follow-up: 본 process 가 issue 한 jti + 만료 시각 매핑.
   * persistentRevokeStore 가 셋업된 환경에서 revoke(jti) 가 호출되면
   * in-memory + persistent 양쪽에 동시 기록. verify 시 in-memory hit
   * 으로 fast-path, miss 면 persistent 조회.
   */
  readonly #issuedJtis = new Map<string, number>();
  readonly #persistentRevokeStore?: PersistentRevokeStore;

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
    this.#persistentRevokeStore = options.persistentRevokeStore;
  }

  async issue(subject: string, role: PrincipalRole): Promise<IssuedToken> {
    return this.issueWithExpiresAt(subject, role, this.#ttlSeconds);
  }

  /**
   * Phase 2 (Runner 인증) — lease token 발급. ttlSeconds 가 짧아도
   * 동일 wire format + 동일 signature scheme — verify 는 변동 없음.
   * 단, expiresAt 을 짧게 (5min 등) 발급해 lease 만료 시 401 로 강제
   * 갱신 흐름을 강제한다.
   */
  async issueWithExpiresAt(
    subject: string,
    role: PrincipalRole,
    ttlSeconds: number
  ): Promise<IssuedToken> {
    if (!subject || FORBIDDEN_IN_SUBJECT.test(subject)) {
      throw new Error(
        `HmacIdentityProvider.issue: subject must be non-empty and must not contain ":" (got ${JSON.stringify(subject)})`
      );
    }
    if (role !== "user" && role !== "admin" && role !== "runner") {
      throw new Error(
        `HmacIdentityProvider.issue: role must be "user", "admin", or "runner" (got ${JSON.stringify(role)})`
      );
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(
        `HmacIdentityProvider.issueWithExpiresAt: ttlSeconds must be positive (got ${ttlSeconds})`
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlSeconds;
    const jti = randomUUID();
    const payload = `${subject}:${role}:${expiresAt}:${jti}`;
    const signature = createHmac("sha256", this.#secret)
      .update(payload, "utf-8")
      .digest("hex");
    // v2 wire format: payload/signature 를 base64url 로 wrapping 하여
    // subject 의 `.` 가 wire format `.` separator 와 충돌하지 않도록.
    const encodedPayload = base64UrlEncode(Buffer.from(payload, "utf-8"));
    const encodedSignature = base64UrlEncode(Buffer.from(signature, "utf-8"));
    const token = `${SCHEME_VERSION_V2}.${encodedPayload}.${encodedSignature}`;
    this.#issuedCount += 1;
    this.#issuedJtis.set(jti, expiresAt);
    return {
      token,
      principal: { subject, role, expiresAt, jti },
      maxAgeSeconds: ttlSeconds
    };
  }

  async verify(token: string): Promise<Principal | null> {
    if (typeof token !== "string" || token.length === 0) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [version, encodedPayload, encodedSignature] = parts as [string, string, string];
    // v1 wire format (plain utf-8) 은 subject 가 `.` 와 충돌하여
    // 잠복 결함이 있어 (TASK-1 3단계) v2 만 받는다.
    if (version !== SCHEME_VERSION_V2) return null;
    if (!encodedPayload || !encodedSignature) return null;

    const payloadBytes = base64UrlDecode(encodedPayload);
    const signatureBytes = base64UrlDecode(encodedSignature);
    if (!payloadBytes || !signatureBytes) return null;
    const payload = payloadBytes.toString("utf-8");

    const expectedSignature = createHmac("sha256", this.#secret)
      .update(payload, "utf-8")
      .digest("hex");
    const providedSignature = signatureBytes.toString("utf-8");

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
    if (roleRaw !== "user" && roleRaw !== "admin" && roleRaw !== "runner") return null;
    const expiresAt = Number.parseInt(expiryRaw, 10);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) return null;

    if (this.#revokedJtis.has(jti)) return null;

    // v0.12.0 follow-up: persistent revoke store check. in-memory miss 면
    // persistent 조회. persistent hit 면 in-memory cache 에도 기록 (다음
    // verify 의 fast-path). TTL 만료된 row 은 expires_at > now() 조건으로
    // 자동 skip — cleanup sweeper 가 background 에서 정리.
    if (this.#persistentRevokeStore) {
      try {
        const persistentHit = await this.#persistentRevokeStore.isRevoked(jti);
        if (persistentHit) {
          this.#revokedJtis.add(jti);
          return null;
        }
      } catch {
        // persistent 조회 실패 시 fail-open (기존 동작 유지 — secret manager
        // / network blip 으로 revoke 가 일시적으로 못 잡혀도 1분 후 lease 갱신
        // / TTL 만료로 자연 안전망). 운영자에게 alert 가 가도록 별도 metric.
        // follow-up: 운영 metric + alert rule 추가.
      }
    }

    return {
      subject,
      role: roleRaw,
      expiresAt,
      jti
    };
  }

  async revoke(jti: string): Promise<void> {
    if (typeof jti !== "string" || jti.length === 0) return;
    this.#revokedJtis.add(jti);
    if (this.#persistentRevokeStore) {
      const expiresAtEpoch = this.#issuedJtis.get(jti);
      const expiresAt = new Date(
        typeof expiresAtEpoch === "number" && expiresAtEpoch > 0
          ? expiresAtEpoch * 1000
          : Date.now() + this.#ttlSeconds * 1000
      );
      try {
        await this.#persistentRevokeStore.revoke(jti, expiresAt);
      } catch {
        // persistent 기록 실패 시 in-memory 는 이미 반영됨. 다음 verify 가
        // 본 process 에서는 in-memory hit 으로 reject, 다른 replica 는
        // persistent hit 으로 reject — 단, 본 record 가 persistent 에 없으면
        // 다른 replica 가 fail-open 으로 통과 가능. 운영 metric + alert.
      }
    }
  }

  async revokeAll(): Promise<void> {
    this.#revokedJtis.clear();
    // persistent 의 revokeAll 은 identity-provider interface 정합을 위해
    // no-op 으로 노출 (admin 강제 전체 로그아웃 후속 TASK). 운영자가
    // 직접 TRUNCATE 할 수 있으나 의도치 않은 사용자 영향 분리.
  }

  activeCount(): number {
    return this.#issuedCount;
  }

  revokedCount(): number {
    return this.#revokedJtis.size;
  }
}

/** base64url encode (RFC 4648 §5) — `+` → `-`, `/` → `_`, padding 제외. */
function base64UrlEncode(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** base64url decode. invalid input 은 null. */
function base64UrlDecode(input: string): Buffer | null {
  if (typeof input !== "string" || input.length === 0) return null;
  // RFC 4648 §5 — base64url chars 만 허용.
  if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const full = remainder === 0 ? padded : padded + "=".repeat(4 - remainder);
  try {
    return Buffer.from(full, "base64");
  } catch {
    return null;
  }
}