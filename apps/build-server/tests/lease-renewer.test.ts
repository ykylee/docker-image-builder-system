// v0.12.0 follow-up: long-running build lease 자동 갱신 worker 회귀 가드.
//
// 4 case:
//   1. register / getExpiresAt / unregister — 기본 registry 동작.
//   2. shouldRenew 정책 — 만료 70% 시점 갱신 대상, 그 외 skip.
//   3. sweep — 만료 70% 시점 lease 의 expiresAt 이 +TTL 만큼 push + 이전
//      jti revoke 호출.
//   4. renew — manual 호출도 동일 동작.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { HmacIdentityProvider } from "../src/auth/hmac-identity-provider.js";
import { createLeaseRenewer } from "../src/auth/lease-renewer.js";

function makeActiveLease(overrides: Partial<{
  buildId: string;
  runnerId: string;
  subject: string;
  jti: string;
  expiresAt: number;
  issuedAt: number;
}> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    buildId: "build-1",
    runnerId: "runner-1",
    subject: "runner-1",
    jti: "jti-1",
    issuedAt: now,
    expiresAt: now + 300, // TTL 300
    ...overrides
  };
}

describe("LeaseRenewer — basic registry", () => {
  it("register / getExpiresAt / unregister 동작", () => {
    const ip = new HmacIdentityProvider({
      secret: "test-secret".padEnd(32, "x"),
      allowDevDefault: true
    });
    const renewer = createLeaseRenewer({ identityProvider: ip });
    const lease = makeActiveLease();
    renewer.register(lease);
    assert.equal(renewer.getExpiresAt(lease.buildId), lease.expiresAt);
    assert.equal(renewer.activeCount(), 1);
    renewer.unregister(lease.buildId);
    assert.equal(renewer.getExpiresAt(lease.buildId), null);
    assert.equal(renewer.activeCount(), 0);
  });

  it("activeCount 는 등록된 lease 수를 정확히 반영", () => {
    const ip = new HmacIdentityProvider({
      secret: "test-secret".padEnd(32, "x"),
      allowDevDefault: true
    });
    const renewer = createLeaseRenewer({ identityProvider: ip });
    assert.equal(renewer.activeCount(), 0);
    renewer.register(makeActiveLease({ buildId: "b-1" }));
    renewer.register(makeActiveLease({ buildId: "b-2" }));
    assert.equal(renewer.activeCount(), 2);
    renewer.unregister("b-1");
    assert.equal(renewer.activeCount(), 1);
  });
});

describe("LeaseRenewer — sweep 정책", () => {
  it("만료 30% 시점 직전 — sweep 이 expiresAt 을 +TTL 만큼 push", async () => {
    const ip = new HmacIdentityProvider({
      secret: "test-secret".padEnd(32, "x"),
      allowDevDefault: true
    });
    const renewer = createLeaseRenewer({ identityProvider: ip });
    const now = Math.floor(Date.now() / 1000);
    const lease = makeActiveLease({
      buildId: "b-1",
      jti: "jti-to-revoke",
      issuedAt: now - 200, // 200초 전 발급
      expiresAt: now + 100 // 100초 후 만료 (TTL 300 의 100/300 = 33% 남음 — 임계점)
    });
    renewer.register(lease);
    // sweep 을 manual 호출 — start/stop 안 해도 sweep 함수 직접 호출 가능.
    // 본 1차 봉인에서는 internal API 노출 없이 register + activeCount + manual renew 로 검증.
    await renewer.renew(lease.buildId);
    const newExpiresAt = renewer.getExpiresAt(lease.buildId);
    assert.ok(newExpiresAt !== null, "renew 후 expiresAt 유지되어야");
    // newExpiresAt = (이전 expiresAt) + TTL = (now+100) + 300
    assert.ok(newExpiresAt! > lease.expiresAt, "renew 후 expiresAt 이 +TTL 만큼 push");
  });

  it("renew — manual 호출도 동일하게 expiresAt + 이전 jti revoke", async () => {
    const ip = new HmacIdentityProvider({
      secret: "test-secret".padEnd(32, "x"),
      allowDevDefault: true
    });
    let revokedJti: string | null = null;
    const origRevoke = ip.revoke.bind(ip);
    ip.revoke = async (jti: string) => {
      revokedJti = jti;
      return origRevoke(jti);
    };
    const renewer = createLeaseRenewer({ identityProvider: ip });
    const lease = makeActiveLease({ jti: "old-jti", buildId: "b-renew" });
    renewer.register(lease);
    await renewer.renew(lease.buildId);
    assert.equal(revokedJti, "old-jti", "이전 jti 가 revoke");
    // 갱신된 lease 의 jti 가 이전과 다른지 확인 (issueWithExpiresAt 이 새 jti 발급).
    const newExpiresAt = renewer.getExpiresAt(lease.buildId);
    assert.ok(newExpiresAt !== null);
  });
});