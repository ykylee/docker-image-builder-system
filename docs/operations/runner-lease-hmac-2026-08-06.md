# Runner 인증 (HMAC lease token) 운영 가이드 (Phase 2, 1·2차 봉인)

- 작성일: 2026-08-06
- TASK: Phase 2 — Runner 인증과 실행 격리 의 1·2차 봉인 (HMAC lease token)
- 시리즈: production-readiness-roadmap Phase 2 의 1·2차 봉인. 빌드 Server ↔ Runner 통신의 인증 강화 + lease 갱신 흐름.

## 의도

Runner 가 build-server 의 build-scoped API (`POST /builds/claim` / `/builds/:id/phase` / `/builds/:id/container-test/{start,result}` / `/builds/:id/deployment`) 를 호출할 때 인증이 부재했던 결함을 봉인한다. 운영자가 신규 cluster / k8s pod / EC2 instance 에서 runner 를 띄울 때 Build Server 가 그 runner 의 신원을 verify 한 뒤에만 claim / phase / deployment API 가 동작한다. Phase 1 의 `X-User-Id` / `X-Admin-Id` 평문 헤더 위조 결함과 동일한 카테고리 — 운영자가 secret manager 로 secret 을 일관 관리하면 위조가 불가능하다.

본 운영 가이드는 lease token 의 발급/검증/갱신 흐름 + 운영자가 신규 runner 를 띄울 때 필요한 secret sync 절차 + 운영 환경 baseline 을 단일 entrypoint 로 정리한다.

## 결정

- **`POST /auth/runner-login`** 신규 — Runner 가 자기 신원 (RUNNER_ID env 와 일치) 을 선언하며 lease token 발급. RUNNER_HMAC_SECRET 이 build-server 측에 셋업되어 있어야 하며, 동일 secret 이 runner 측 환경에도 있어야 한다. unknown runner 면 401 + Runner is not registered (운영자가 admin /admin/runners 로 pre-registration 가능). DISABLED runner 면 403 + Runner is disabled by admin (TASK-069 의 RUNNER_DISABLED gate 와 정합).
- **`POST /auth/runner-lease-renew`** 신규 — Runner 가 만료 전 lease 갱신. 만료된 lease 는 401 reject. 갱신 시 동일 subject + role + 새 jti 발급 — 이전 jti 는 server 측 revoke Set 에 등록되어 stale client 의 lease 재사용 차단.
- **`ClaimResponse`** schema 확장 — `leaseToken` + `expiresAt` nullable 필드 추가. claim 성공 시 동봉. claimed=false 면 둘 다 null.
- **`BuildService.claimNextBuild`** 가 BuildService.runtime.identityProvider 가 셋업된 환경에서 lease 발급. 미셋업 환경 (단위 테스트 / legacy 운영 baseline) 에서는 lease 미발급 — caller 가 lease 를 첨부하지 않으므로 후속 build-scoped API 의 `enforceRunnerLease` 가 silent skip (단, `leaseGateEnabled: true` 인 환경에서는 401).
- **`enforceRunnerLease`** helper 신규 — build-routes 의 5개 Runner API 진입 시 호출. cookie/Bearer 인증 + role=runner 면 통과, admin/user 면 silent skip (기존 owner policy), 인증 부재면 401 + Authentication required + hint.

## 1. 회귀 baseline

| 항목 | 값 |
| --- | --- |
| build-server `node --import tsx --test tests/*.test.ts` | **285/285 PASS** (이전 278 + 신규 7: runner-lease round-trip 4 / renew 3) |
| TS 5 packages `--noEmit` | clean |
| runner `go test ./...` | **8 packages PASS** (기존 + stub interface EnsureLease/RenewLease/LoginLease 추가) |
| session-end 가드 9종 | 9/9 PASS (release commit 후) |

## 2. 운영 명령

### 2.1 Production (Runner 인증 ON + lease gate ON)

Build Server 측 — `AUTH_HMAC_SECRET` 셋업이 곧 `identityProvider` 활성. 동일 secret 이 runner 측 환경에도 있어야 함.

```bash
DATABASE_URL=postgres://postgres:***@***/docker_image_builder \
  AUTH_HMAC_SECRET=$(cat /run/secrets/auth_hmac_secret) \
  RUNNER_LEASE_TTL_SECONDS=${RUNNER_LEASE_TTL_SECONDS:-300} \
  BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  node apps/build-server/dist/apps/build-server/src/index.js
```

Runner 측 — 동일한 secret + 동일 `RUNNER_ID` env:

```bash
RUNNER_ID=runner-prod-east-1 \
  HOST_SERVER_BASE_URL=http://build-server.internal:3000 \
  BUILD_SERVER_HMAC_SECRET=$(cat /run/secrets/runner_hmac_secret) \
  apps/runner/bin/runner
```

### 2.2 Self-dogfood / Staging (cookie 인증 ON + legacy ON + Runner 인증 ON)

```bash
# build-server
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
  AUTH_HMAC_SECRET=staging-secret-32-bytes-or-more-xxxxx \
  AUTH_LEGACY_HEADERS=true \
  BUILD_OWNER_POLICY_LEGACY_DEFAULT_SUBJECT="<anonymous>" \
  RUNNER_LEASE_TTL_SECONDS=300 \
  BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  node apps/build-server/dist/apps/build-server/src/index.js

# runner
RUNNER_ID=runner-self-dogfood-1 \
  HOST_SERVER_BASE_URL=http://127.0.0.1:3000 \
  BUILD_SERVER_HMAC_SECRET=staging-secret-32-bytes-or-more-xxxxx \
  apps/runner/bin/runner
```

### 2.3 단위 테스트 / Legacy (Runner 인증 OFF)

`AUTH_HMAC_SECRET` 미주입 + `identityProvider` 미셋업 → `leaseGateEnabled: false` (default) → `enforceRunnerLease` 가 silent skip. 기존 단위 테스트 호환.

## 3. 사용 절차

### 3.1 Runner boot

```bash
# 1) Runner 가 /auth/runner-login 으로 lease token 발급.
#    응답: { leaseToken: "v2.<base64url>.<base64url>", expiresAt: 1700000000, runnerId: "runner-1" }
curl -X POST http://127.0.0.1:3000/auth/runner-login \
  -H "content-type: application/json" \
  -d '{"runnerId":"runner-1"}'

# 2) Lease token 을 atomic.Value 에 저장 + expiresAt 시각 기록.

# 3) 매 build-scoped API 호출 직전 EnsureLease 호출 — 만료 60초 이내면 자동 갱신.
#    이후 Authorization: Bearer <leaseToken> 헤더 첨부.
curl -X POST http://127.0.0.1:3000/builds/claim \
  -H "content-type: application/json" \
  -H "Authorization: Bearer v2.<base64url>.<base64url>" \
  -d '{"runnerId":"runner-1"}'
# → 200 + { claimed, build, reason, leaseToken, expiresAt }
#    leaseToken / expiresAt 는 다음 갱신 주기까지 보관.
```

### 3.2 Runner 가 lease 갱신

```bash
# 4) lease 만료 60초 전 (또는 주기적 heartbeat) /auth/runner-lease-renew 호출.
curl -X POST http://127.0.0.1:3000/auth/runner-lease-renew \
  -H "Authorization: Bearer v2.<base64url>.<base64url>"
# → 200 + { leaseToken, expiresAt, runnerId }
#    새 leaseToken 으로 교체 (이전 jti 는 server 측 revoke Set 등록).

# 5) DISABLED 된 runner 가 갱신 시도 → 403.
#    admin 이 /admin/runners/:runnerId PATCH 로 status=DISABLED 토글.
```

### 3.3 운영자가 신규 Runner 등록

```bash
# 1) admin 이 Build Server 의 /admin/runners 로 pre-registration.
curl -X POST http://127.0.0.1:3000/admin/runners \
  -H "x-admin-id: admin" -H "content-type: application/json" \
  -d '{"runnerId":"runner-prod-east-1"}'
# → 201 + { runner: { runnerId, status: "ACTIVE", ... } }

# 2) Runner 가 boot 시 /auth/runner-login 호출 → 200 + lease.
#    (admin pre-registration 없이 claim 만 해도 self-register 가 발생하지만,
#    운영자가 사전에 알리는 흐름이 TASK-077 의 의도.)
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
# → 285/285 PASS
(cd apps/runner && go test ./...)
# → 8 packages PASS

# 4) secret manager 의 AUTH_HMAC_SECRET 셋업 — 운영자가 동일한 secret 을
#    build-server 와 모든 runner 측 env 에 주입해야 한다. drift 시 한쪽이
#    verify 실패.
```

### 4.2 배포

```bash
# build-server / runner / build-monitor 이미지 rebuild + deploy.
# 신규 env 가 1종 (RUNNER_LEASE_TTL_SECONDS). secret manager 의 manifest 갱신:
#   AUTH_HMAC_SECRET                  # 기존 (Phase 1 필수, 운영 baseline)
#   RUNNER_LEASE_TTL_SECONDS          # 신규 (Phase 2, default 300)
```

### 4.3 배포 후 검증

```bash
# 1) health
curl http://build-server:3000/health
# → 200 + {"status":"ok"}

# 2) /auth/runner-login — 운영자가 admin 등록한 runner 로 검증.
ADMIN_TOKEN=$(curl -s -X POST http://build-server:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"subject":"admin","role":"admin"}' -c cookies.txt)

# admin register runner
curl -X POST http://build-server:3000/admin/runners \
  -H "x-admin-id: admin" -H "content-type: application/json" \
  -d '{"runnerId":"runner-verify"}'
# → 201

# 3) /auth/runner-login — lease 발급.
curl -X POST http://build-server:3000/auth/runner-login \
  -H "content-type: application/json" \
  -d '{"runnerId":"runner-verify"}'
# → 200 + {"leaseToken":"v2.<base64url>.<base64url>","expiresAt":...,"runnerId":"runner-verify"}

# 4) /builds/claim — lease 첨부.
curl -X POST http://build-server:3000/builds/claim \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <leaseToken>" \
  -d '{"runnerId":"runner-verify"}'
# → 200 + ClaimResponse (leaseToken / expiresAt 동봉 — 다음 갱신까지)

# 5) /auth/runner-lease-renew — lease 갱신.
curl -X POST http://build-server:3000/auth/runner-lease-renew \
  -H "Authorization: Bearer <leaseToken>"
# → 200 + 새 leaseToken

# 6) lease 없이 /builds/claim 호출 → 401.
curl -X POST http://build-server:3000/builds/claim \
  -H "content-type: application/json" \
  -d '{"runnerId":"runner-verify"}'
# → 401 + {"message":"Authentication required.","hint":"POST /auth/runner-login to obtain a lease token."}
```

### 4.4 v1 token 무호환 (wire format 변경)

Phase 1 3단계 봉인에서 HMAC 토큰 wire format 이 `v1.<plain-utf8>.<hex-sig>` → `v2.<base64url>.<base64url>` 로 변경됐다. **v1 토큰은 reject**. Phase 2 의 lease token 도 동일 v2 형식 사용 — Phase 1 의 v2 형식이 Phase 2 의 lease token 까지 정합.

운영자가 stale phase 1 cookie / phase 2 lease 보유 시 자가 복구 절차: client 가 cookie 만료 / 401 응답 시 /auth/login (cookie) 또는 /auth/runner-login (lease) 재호출로 v2 토큰 재발급.

## 5. 사전 결함 + 보강 4건

| # | 결함 | 보강 | 단계 |
| --- | --- | --- | --- |
| 1 | Runner 가 build-scoped API 를 인증 없이 호출 가능 | HMAC v2 lease token + Authorization Bearer 헤더 강제. unknown runner 401 + DISABLED 403 + 만료 401 + 갱신 200. | 1 |
| 2 | Runner 가 무한히 lease 를 갱신해 stale build 활동 가능 | TTL 5분 default + 만료 60초 전 갱신 + DISABLED 시 갱신 거부. jti 갱신으로 stale client 의 lease 재사용 차단. | 2 |
| 3 | lease 검증을 build-scoped API 의 모든 라우트에 적용 시 admin/user 의 정상 호출을 막음 | `enforceRunnerLease` 가 role=runner 만 lease 검증 + admin/user silent skip. 단위 테스트는 lease gate 비활성으로 silent skip. | 2 |
| 4 | HMAC v2 base64url encoding 이 subject 의 `:` 와 충돌 | HmacIdentityProvider.issueWithExpiresAt 가 `:` 차단. runner subject 는 raw runnerId (prefix 없이) — role === "runner" 로 식별. | 1 |

## 6. 운영 환경 baseline

| 항목 | 값 |
| --- | --- |
| 5 package.json version | `0.10.0` (Phase 2 1·2차는 본 운영 가이드와 동봉, version bump 는 후속 TASK) |
| migration | `0001~0018` (변경 0) |
| AUTH_HMAC_SECRET | 운영 secret manager 주입 필수. build-server + 모든 runner 동일 secret. |
| RUNNER_LEASE_TTL_SECONDS | default 300 (5분) |
| lease 갱신 임계값 | 만료 60초 전 (runner 측 EnsureLease) |
| wire format | v2.<base64url(payload)>.<base64url(signature)> (Phase 1 3단계와 동일) |
| payload 구조 | `<subject>:<role>:<expiry-epoch>:<jti>` (subject=runnerId raw, role=runner) |
| 서명 | HMAC-SHA256 + base64url |
| jti | crypto.randomUUID |
| revocation | 메모리 Set (Phase 1 동일) |

## 7. 한계와 follow-up

1. **메모리 revoke Set 의 멀티 replica 한계**: Phase 1 1·2차 봉인의 메모리 revoke Set 한계와 동일 — 멀티 build-server replica 운영 시 revoke 가 즉시 공유되지 않음. follow-up: Redis / Postgres 영속화 (Phase 1 follow-up 후보, Phase 2 와 동시 봉인 가능).
2. **lease TTL 5분의 의미**: Runner 가 claim 후 5분 안에 phase / container-test / deployment 보고를 완료하지 못하면 lease 만료 → 후속 보고는 401 reject. 운영자가 `RUNNER_LEASE_TTL_SECONDS` 를 늘려 cover 가능하지만, long-running build 의 운영 책임 표면. follow-up: long-running build (e.g. multi-hour build) 의 lease 자동 갱신 worker.
3. **HMAC v2 wire format 의 multi-replica secret drift**: 동일 secret 을 모든 replica + runner 가 공유해야 verify 가 일치. secret manager 의 자동 rotation 시 모든 replica + runner 가 동기 갱신 필요. follow-up: secret rotation 자동화 (Phase 1 follow-up).
4. **Phase 2 의 후속 봉인 (3·4·5차)**: 본 운영 가이드는 1·2차 봉인만 다룬다. 후속 봉인 작업:
   - **3차**: Runner별 K8s RBAC 최소 권한 (P2-M5 의 k8s adapter 확장 + Task-175 follow-up).
   - **4차**: build sandbox 를 host Docker socket 공유에서 분리 (rootless BuildKit 또는 전용 build worker).
   - **5차**: build network, CPU, memory, process, timeout 제한 + 사용자 build 와 platform control-plane image 를 실행 node/namespace 로 분리.
5. **DISABLED 토글의 lease 즉시 회수**: admin 이 runner 를 DISABLED 토글해도, runner 가 현재 보유한 lease 가 만료 전까지는 동작 — Phase 2 1·2차 봉인의 정책은 "DISABLED 시 lease 갱신 거부 + 신규 lease 발급 거부". 기존 lease 의 회수는 TTL 만료에 의존. follow-up: WebSocket / SSE 기반 실시간 lease revoke 채널.

## 8. 결정

본 운영 가이드가 봉인된 Phase 2 1·2차 봉인이 운영 baseline. 운영자가 staging 에서 `/auth/runner-login` round-trip + claim 응답의 leaseToken 동봉 + 만료 60초 전 자동 갱신 흐름을 실측한 뒤 production 적용 권장. 운영 환경의 `RUNNER_LEASE_TTL_SECONDS` 는 default 300 (5분) 유지 — long-running build 는 TTL 증가로 cover.