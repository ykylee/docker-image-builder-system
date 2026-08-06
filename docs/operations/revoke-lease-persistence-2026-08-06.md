# Revoke / Lease 영속화 + 자동 갱신 운영 가이드 (v0.12.0)

- 작성일: 2026-08-06
- TASK: v0.12.0 follow-up — (1) HMAC 토큰 jti revoke Set 의 Postgres 영속화 + (2) long-running build lease 자동 갱신 worker
- 시리즈: production-readiness-roadmap Phase 2 follow-up. Phase 1 Identity + Phase 2 Runner 인증 의 멀티 build-server replica 운영 안정성 강화.

## 의도

v0.10.0 / v0.11.0 의 HMAC 토큰 revoke Set 은 **in-memory** — build-server 가 재시작되면 모든 jti revoke 가 소실. 멀티 build-server replica 운영 시 한 replica 의 logout 이 다른 replica 에 즉시 전파되지 않음. lease token 의 long-running build (multi-hour) 가 lease TTL (5분) 을 초과하면 후속 phase 보고가 401 reject. 본 운영 가이드는 두 follow-up 으로 봉인.

## 결정

- **Postgres `revoke_jti` table 신규** — jti PK + `expires_at timestamptz` + `created_at timestamptz`. expires_at index 로 cleanup sweeper 의 TTL 만료 row 삭제 최적화. migration 0019.
- **`PersistentRevokeStore`** 신규 — `apps/build-server/src/auth/persistent-revoke-store.ts`. SELECT (revoke 조회, `expires_at > now()` 조건) / INSERT (`ON CONFLICT (jti) DO NOTHING` 중복 no-op) / TRUNCATE 후속. `HmacIdentityProvider` 가 이 store 를 옵션으로 받음. 미주입 시 in-memory only 동작 (legacy / 단위 테스트 환경).
- **fail-open 정책** — persistent store 조회 실패 시 in-memory 만으로 reject. secret manager / network blip 으로 revoke 가 일시적으로 못 잡혀도 1분 후 lease 갱신 / TTL 만료로 자연 안전망. 운영자에게 alert 가도록 별도 metric 후속.
- **`LeaseRenewer` background worker 신규** — `apps/build-server/src/auth/lease-renewer.ts`. active lease registry (Map<buildId, ActiveLease>) + 30초 sweep + 만료 30% 시점 자동 갱신 (expiresAt += TTL). 만료된 이전 jti 는 revoke (in-memory + persistent). postgres backend + persistentRevokeStore 셋업 시에만 활성.
- **`BuildService.claimNextBuild`** 가 claim 성공 시 lease-renewer 에 lease 등록. 후속 manual 갱신 (admin 강제 logout) 시 `unregister` 호출 가능. process-local registry — multi-replica 한계.

## 1. 회귀 baseline

| 항목 | 값 |
| --- | --- |
| build-server `node --import tsx --test tests/*.test.ts` | **295/295 PASS** (이전 285 + v0.12.0 10 신규: lease-renewer 4 + persistent-revoke-store 6) |
| TS 5 packages `--noEmit` | clean |
| migration | **0001~0019** (신규 0019_revoke_jti.sql) |
| session-end 가드 9종 | 9/9 PASS (release commit 후) |

## 2. 운영 명령

### 2.1 Production (Postgres backend + revoke 영속화 + lease 자동 갱신)

```bash
# 신규 env 없음 — 기존 v0.11.0 운영 명령 + DATABASE_URL 로 postgres 사용.
DATABASE_URL=postgres://postgres:***@***/docker_image_builder \
  AUTH_HMAC_SECRET=$(cat /run/secrets/auth_hmac_secret) \
  RUNNER_LEASE_TTL_SECONDS=${RUNNER_LEASE_TTL_SECONDS:-300} \
  BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  node apps/build-server/dist/apps/build-server/src/index.js
# build-server 부팅 시:
#   1) migration 0019 자동 적용 (revoke_jti table 생성)
#   2) PersistentRevokeStore 셋업 + HmacIdentityProvider 에 주입
#   3) LeaseRenewer background worker 시작 (postgres backend 일 때만)
#   4) /auth/login + /auth/runner-login 정상
```

### 2.2 Self-dogfood / Staging (Memory backend + revoke 비영속화)

```bash
# BUILD_REPOSITORY_BACKEND=memory 면 PersistentRevokeStore / LeaseRenewer 미주입.
# 기존 in-memory 동작 유지. 단일 runner / 단일 build / 빠른 smoke / CI / 디버깅용.
BUILD_REPOSITORY_BACKEND=memory \
  AUTH_HMAC_SECRET=staging-secret-32-bytes-or-more-xxxxx \
  node apps/build-server/dist/apps/build-server/src/index.js
```

### 2.3 단위 테스트

```bash
cd apps/build-server && AUTH_HMAC_SECRET=test-secret node --import tsx --test tests/*.test.ts
# → 295/295 PASS
```

## 3. 사용 절차

### 3.1 멀티 build-server replica 운영

```bash
# replica-1 + replica-2 모두 동일 DATABASE_URL + 동일 AUTH_HMAC_SECRET 운영.
#   - replica-1 에서 /auth/logout (jti revoke) → persistent INSERT
#   - replica-2 의 다음 verify 가 persistent SELECT → in-memory miss 면
#     persistent hit → reject. (in-memory cache 도 채워짐)
#   - cleanup: replication 의 expires_at < now() row 을 background sweeper 가
#     주기 삭제 (본 1차 봉인 범위 밖, Phase 3 follow-up).
```

### 3.2 long-running build 의 lease 자동 갱신

```bash
# 1) Runner 가 claim 으로 lease 발급 (TTL 300s).
# 2) Runner 가 phase / container-test / deployment 보고.
# 3) build 가 200초 (TTL 의 67%) 동안 진행 중 — LeaseRenewer 의 다음 sweep (30초 후) 이
#    expiresAt 을 +300s 만큼 push + 이전 jti revoke. 이 시점에 Runner 측의
#    원본 lease 가 만료되어도 Build Server 의 in-memory registry 의 새
#    expiresAt 이 더 크므로 verify 시 정상 통과.
# 4) build 가 1000초 후 terminal — Runner 의 last call (logout) 에서 jti revoke.
```

### 3.3 운영자가 직접 sweeper 운영

```bash
# Postgres 운영 환경에서 revoke_jti 의 만료 row 정리 (1차 봉인 범위 밖).
# Phase 3 follow-up 의 background sweeper 가 자동화. 운영자가 manual 정리 시:
psql -c "DELETE FROM revoke_jti WHERE expires_at < now();"
# → 만료 row 만 삭제. active row (expires_at > now) 는 보존.
```

## 4. 운영 환경 배포 절차

### 4.1 사전 점검

```bash
# 1) main HEAD 의 의도 / 영향 검토.
git log --oneline -n 5

# 2) workflow meta 동기성 — session-end 가드 9종.
python3 ai-workflow/skills/session-end/scripts/run_session_end.py --workspace-root "$PWD"
# → 9/9 PASS

# 3) 회귀 baseline sanity.
cd apps/build-server && AUTH_HMAC_SECRET=test-secret node --import tsx --test tests/*.test.ts
# → 295/295 PASS
```

### 4.2 배포

```bash
# build-server 이미지 rebuild + deploy. 신규 env 없음.
# 기존 secret manager 의 manifest 가 DATABASE_URL + AUTH_HMAC_SECRET + RUNNER_LEASE_TTL_SECONDS
# 만 포함하면 됨. (revoke 영속화 + lease 자동 갱신은 DATABASE_URL 셋업만으로 활성.)
# boot 시 migration 0019 자동 적용 (revoke_jti table 생성).
```

### 4.3 배포 후 검증

```bash
# 1) health
curl http://build-server:3000/health
# → 200

# 2) schema 검증 — revoke_jti table 존재.
psql -c "\d revoke_jti"
# → jti text PK, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now(), revoke_jti_expires_at_idx

# 3) /auth/runner-login + /auth/logout
LEASE=$(curl -s -X POST http://build-server:3000/auth/runner-login \
  -H "content-type: application/json" -d '{"runnerId":"runner-verify"}' | jq -r '.leaseToken')
# → 200 + leaseToken

# 4) /auth/logout — jti revoke.
curl -X POST http://build-server:3000/auth/logout -b cookies.txt
# → 204

# 5) revoke_jti table 에 row 존재 확인.
psql -c "SELECT jti, expires_at FROM revoke_jti WHERE expires_at > now() LIMIT 1;"
# → jti + expires_at 출력

# 6) 같은 lease 로 /builds/claim 호출 → 401 (revoke 검증).
curl -X POST http://build-server:3000/builds/claim \
  -H "content-type: application/json" \
  -H "Authorization: Bearer ${LEASE}" \
  -d '{"runnerId":"runner-verify"}'
# → 401
```

## 5. 사전 결함 + 보강 4건

| # | 결함 | 보강 | 단계 |
| --- | --- | --- | --- |
| 1 | in-memory revoke Set — build-server 재시작 시 revoke 손실 + 멀티 replica 미전파 | `revoke_jti` table + `PersistentRevokeStore` + `HmacIdentityProvider.persistentRevokeStore` 옵션 | 1 |
| 2 | long-running build 의 lease TTL 초과 → 401 reject | `LeaseRenewer` background worker — 만료 30% 시점 expiresAt += TTL + 이전 jti revoke | 2 |
| 3 | persistent store 조회 실패 시 전체 시스템 fail | fail-open — in-memory 만으로 reject / silent pass (다음 sweep / TTL 만료로 안전망) + 운영 metric 후속 | 1 |
| 4 | LeaseRenewer 의 sweep timer 가 process 종료 시 leak | `setInterval().unref()` + `stop()` 메서드 + create-app.ts 의 `onClose` hook | 2 |

## 6. 운영 환경 baseline

| 항목 | 값 |
| --- | --- |
| 5 package.json version | `0.12.0` (본 minor bump) |
| migration | `0001~0019` (신규 0019_revoke_jti.sql) |
| `AUTH_HMAC_SECRET` | 운영 secret manager 필수 (Phase 1 정책 정합) |
| `RUNNER_LEASE_TTL_SECONDS` | default 300 (5분) |
| `BUILD_REPOSITORY_BACKEND` | `postgres` 일 때만 persistent revoke store + lease renewer 활성 |
| sweep 주기 | 30s (LeaseRenewer) |
| 갱신 임계값 | 만료 30% 시점 (TTL 의 0.3) |
| revoke_jti cleanup | background sweeper 후속 (Phase 3 follow-up) |

## 7. 한계와 follow-up

1. **revoke_jti cleanup sweeper 부재** — TTL 만료 row 이 누적. PostgreSQL partition by month + background cron 의 cleanup 후속. Phase 3 follow-up.
2. **LeaseRenewer 의 multi-replica 한계** — process-local registry. 한 replica 의 sweeper 가 만료 30% 시점 갱신하지만, 다른 replica 는 본 replica 의 새 expiresAt 을 모름. follow-up: persistent `active_lease` table + 멀티 replica 정합 보강.
3. **fail-open 정책의 운영 metric / alert 부재** — persistent store 조회 실패가 silent. follow-up: alert rule + metric (`revoke_persistent_lookup_failure_total`).
4. **admin 강제 전체 로그아웃 endpoint 부재** — `revokeAll` 이 no-op. follow-up: admin endpoint 가 TRUNCATE 호출.
5. **DISABLED 토글 시 즉시 lease 회수** — Phase 2 1·2차 봉인 follow-up 으로 남음. 본 1차 봉인에서는 TTL 만료 의존.

## 8. 결정

본 운영 가이드가 봉인된 v0.12.0 follow-up 의 운영 baseline. 운영자가 staging 에서 `psql \d revoke_jti` + `/auth/runner-login` + `/auth/logout` 의 6 단계 + LeaseRenewer 의 `setExpiresAt += TTL` 자동 갱신을 실측한 뒤 production 적용 권장. 운영자가 manual cleanup (`DELETE FROM revoke_jti WHERE expires_at < now()`) 을 cron 으로 운영하거나 Phase 3 follow-up 의 background sweeper 를 대기.