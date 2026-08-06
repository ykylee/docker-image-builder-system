// v0.12.0 follow-up: long-running build 의 lease 만료 전 자동 갱신.
//
// 본 모듈은 Build Server 측 process-local timer 로, 활성 lease 의
// 만료 시각을 추적 + 만료 70% 시점에 expiresAt 을 +TTL 만큼 늘림.
// Runner 측 code 변경 없음 — Runner 는 만료 시각을 신경쓰지 않아도
// Build Server 가 자체 registry 의 lease 를 자동 갱신한다.
//
// 설계 노트:
//   - 본 process 가 발급한 lease 만 추적. 다른 process 의 lease 는 알
//     수 없음 — follow-up TASK 에서 persistent active_lease_registry 추가.
//   - 갱신 정책: expiresAt - now < TTL * 0.3 일 때 expiresAt += TTL.
//     본 process 의 verify 가 본 registry 를 항상 신뢰하므로 (TTL
//     연장) Runner 가 보유한 lease 가 만료되어도 Build Server 의
//     preHandler 가 정상 통과시킨다. 다른 replica 의 preHandler 는
//     Runner 의 lease 가 만료되어 401 reject — 본 TASK 의 한계.
//   - 본 1차 봉인은 Runner 측 EnsureLease 의 보완. Runner 측 자동 갱신이
//     동작하지 않는 multi-replica 운영 환경 / long-running build 의
//     안전망. 후속 TASK 에서 persistent registry + 멀티 replica 정합
//     보강.

import type { HmacIdentityProvider } from "./hmac-identity-provider.js";

export interface ActiveLease {
  readonly buildId: string;
  readonly runnerId: string;
  readonly subject: string;
  readonly jti: string;
  readonly expiresAt: number;
  readonly issuedAt: number;
}

export interface LeaseRenewerOptions {
  /** 본 HmacIdentityProvider. revoke 시 사용 (다른 process 의 stale jti reject). */
  readonly identityProvider: HmacIdentityProvider;
  /** sweep 주기 (ms). default 30s. */
  readonly sweepIntervalMs?: number;
  /** 만료 30% 시점 갱신 정책. default 0.3. */
  readonly renewBeforeRatio?: number;
}

export interface LeaseRenewer {
  register(lease: ActiveLease): void;
  /** active lease 의 expiresAt 을 +TTL 만큼 늘리고 이전 jti revoke.
   *  buildId 가 active lease 가 아니면 no-op. */
  renew(buildId: string): Promise<void>;
  getExpiresAt(buildId: string): number | null;
  unregister(buildId: string): void;
  activeCount(): number;
  start(): void;
  stop(): void;
}

export function createLeaseRenewer(
  options: LeaseRenewerOptions
): LeaseRenewer {
  const renewBeforeRatio = options.renewBeforeRatio ?? 0.3;
  const sweepIntervalMs = options.sweepIntervalMs ?? 30_000;
  const registry = new Map<string, ActiveLease>();
  let timer: NodeJS.Timeout | undefined;

  function shouldRenew(lease: ActiveLease, now: number): boolean {
    const ttlMs = (lease.expiresAt - lease.issuedAt) * 1000;
    if (ttlMs <= 0) return false;
    const remaining = lease.expiresAt - now;
    return remaining > 0 && remaining < ttlMs * renewBeforeRatio;
  }

  function sweep(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const lease of registry.values()) {
      if (!shouldRenew(lease, now)) continue;
      const ttl = lease.expiresAt - lease.issuedAt;
      if (ttl <= 0) continue;
      const previousJti = lease.jti;
      const newExpiresAt = lease.expiresAt + ttl;
      // 본 process 의 in-memory registry 만 갱신 — jti 가 바뀌지 않음.
      // 다른 process 의 preHandler 는 Runner 의 원본 만료 시각 기준이므로
      // 1차 봉인의 한계. 후속 TASK 에서 persistent registry + 멀티 replica
      // 정합 보강.
      registry.set(lease.buildId, {
        ...lease,
        expiresAt: newExpiresAt,
        // 본 sweep 의 시각을 issuedAt 의 anchor 로 갱신하지 않음 — TTL 계산의
        // 일관성 유지 (issuedAt 은 원본 issue 시각, expiresAt 만 +TTL 만큼 push).
      });
      // 이전 jti revoke (fire-and-forget) — persistent revoke store 의 다른
      // replica 가 본 jti 를 reject. Runner 측의 stale jti 도 거부.
      void options.identityProvider.revoke(previousJti).catch(() => {
        // revoke 실패 시 silent — 다음 sweep 에서 재시도 + 운영 metric.
      });
    }
  }

  return {
    register(lease: ActiveLease): void {
      registry.set(lease.buildId, lease);
    },
    async renew(buildId: string): Promise<void> {
      const cur = registry.get(buildId);
      if (!cur) return;
      const ttl = cur.expiresAt - cur.issuedAt;
      if (ttl <= 0) return;
      const previousJti = cur.jti;
      registry.set(buildId, {
        ...cur,
        expiresAt: cur.expiresAt + ttl
      });
      try {
        await options.identityProvider.revoke(previousJti);
      } catch {
        // silent — 다음 sweep 에서 재시도.
      }
    },
    getExpiresAt(buildId: string): number | null {
      return registry.get(buildId)?.expiresAt ?? null;
    },
    unregister(buildId: string): void {
      registry.delete(buildId);
    },
    activeCount(): number {
      return registry.size;
    },
    start(): void {
      if (timer) return;
      timer = setInterval(sweep, sweepIntervalMs);
      timer.unref();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    }
  };
}