# Identity + 테넌트 권한 운영 가이드 (Phase 1)

- 작성일: 2026-08-06
- TASK: Phase 1 — Identity + 테넌트 권한 1·2·3·4단계 봉인 (HMAC Bearer cookie + principal preHandler + build-routes owner policy + admin-routes requireAdmin)
- 시리즈: production-readiness-roadmap Phase 1 의 1차 봉인. 1·2단계 (인증 인프라 + `/auth/login·logout·whoami`) → 3단계 (build-routes owner policy + v2 wire format) → 4단계 (admin-routes enforceAdminGuard 단일화).

## 의도

2026-08-06 현재 production 환경(production deployment) 의 build-server 가 노출하던 두 가지 보안 결함을 봉인한다:

1. **`X-User-Id` / `X-Admin-Id` 평문 헤더 위조** — Build Monitor 가 사용자 입력값을 그대로 X-User-Id 헤더에 실어 보내고, Build Server 는 그 값을 인증 정보로 신뢰. 타 사용자 / 관리자 신원 위조가 가능하다. 또한 `localStorage` 의 `userId` 키가 인증 표면이라 XSS 한 줄로 탈취 가능.
2. **Build / Runner API 무인증** — `POST /builds` / `POST /builds/:id/phase` / `POST /builds/claim` 등이 인증 없이 호출 가능. 멀티 테넌트 환경에서 다른 owner 의 build 위조 + Runner claim race 모두 가능.

본 운영 가이드는 HMAC 서명 Bearer cookie + principal preHandler + build/admin routes owner/admin policy 의 4단계 봉인을 단일 entrypoint 로 정리하고, 운영자가 환경 변수 / 운영 명령 / 마이그레이션 절차 / 마이그레이션 책임 범위를 한 자릿에서 인지할 수 있도록 한다.

## 결정

**옵션 A (채택)** — cookie 인증 default OFF + legacy X-User-Id / X-Admin-Id 헤더 fallback default OFF. 운영자가 `AUTH_HMAC_SECRET` + `AUTH_LEGACY_HEADERS=true` 를 명시적으로 셋업할 때만 cookie + legacy fallback 경로가 동작.

> **운영 baseline 의 정책 결정 (사용자 확정)**: 운영 환경은 cookie 인증을 활성화(`AUTH_HMAC_SECRET` 주입)하고 legacy 헤더는 OFF(`AUTH_LEGACY_HEADERS` 미설정)가 canonical. self-dogfood / staging / 외부 admin UI 마이그레이션 경로에서만 `AUTH_LEGACY_HEADERS=true` 를 켜서 X-User-Id / X-Admin-Id 헤더 호출을 그대로 통과시킨다.

## 1. 4단계 회귀 baseline

| 항목 | 값 |
| --- | --- |
| build-server `node --import tsx --test tests/*.test.ts` | **278/278 PASS** (1·2단계 14 신규 + 3단계 14 신규 + 4단계 6 신규) |
| TS 5 packages `--noEmit` | clean |
| `git diff --check` | clean |
| session-end 가드 9종 | 9/9 PASS |

| 단계 | 신규 회귀 가드 | 신규 file |
| --- | --- | --- |
| 1·2단계 | `auth-routes.test.ts` 14 case (login 4 / whoami 3 / logout 2 / HMAC edge case 4 / legacy-headers default OFF 1) | `packages/shared-contract/src/auth/` + `apps/build-server/src/auth/{identity-provider,hmac-identity-provider,request-principal}.ts` + `apps/build-server/src/routes/auth-routes.ts` |
| 3단계 | `build-owner-policy.test.ts` 12 case (cookie 인증 owner 가드 / admin role / legacy ON/OFF / body requestedBy 위조 / 부재 404 / user role query 위조 / logs·DELETE source 가드) | `apps/build-server/src/routes/build-routes.ts` (enforceOwnerPolicy) + `apps/build-server/src/repositories/build-repository.ts` (`tryGetBuildOwner` 1 helper) + `apps/build-server/src/services/build-service.ts` (`getBuildOwner` thin wrapper) |
| 4단계 | `admin-routes-prehandler.test.ts` 6 case (cookie admin 200 / cookie user 403 / legacy ON X-Admin-Id 200 / legacy OFF X-Admin-Id 401 hint / legacy ON X-Admin-Id 비-allow-list 403 callerId echo / 인증 부재 401 hint) | `apps/build-server/src/routes/admin-routes.ts` (`enforceAdminGuard` + `resolveAdminCallerId` helpers) |
| wire format 봉인 | 3단계 `auth-routes.test.ts` +2 case (v2 round-trip + subject `.` 허용) | `apps/build-server/src/auth/hmac-identity-provider.ts` (v1 → v2 base64url 전환, v1 reject) |

회귀 영향 0 인 자산: build-monitor / runner / SQL / schema / migration / 5 package.json.

## 2. 운영 명령

### 2.1 Production (cookie 인증 ON, legacy OFF)

```bash
# secret manager 가 AUTH_HMAC_SECRET 을 주입. dev/test 와 분리된 32+ byte secret 필수.
# 운영 환경 (production deployment) 은 Postgres 만 사용.
DATABASE_URL=postgres://postgres:***@***/docker_image_builder \
  AUTH_HMAC_SECRET=$(cat /run/secrets/auth_hmac_secret) \
  BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  node apps/build-server/dist/apps/build-server/src/index.js
```

### 2.2 Self-dogfood / Staging (cookie 인증 ON, legacy ON — X-User-Id / X-Admin-Id 헤더 마이그레이션 호환)

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
  AUTH_HMAC_SECRET=staging-secret-32-bytes-or-more-xxxxx \
  AUTH_LEGACY_HEADERS=true \
  BUILD_OWNER_POLICY_LEGACY_DEFAULT_SUBJECT="<anonymous>" \
  BUILD_REPOSITORY_BACKEND=postgres \
  DB_AUTO_BOOTSTRAP=true \
  node apps/build-server/dist/apps/build-server/src/index.js
```

### 2.3 단위 테스트 (cookie 인증 OFF, identityProvider 미주입)

```bash
AUTH_HMAC_SECRET=test-secret node --import tsx --test tests/*.test.ts
```

## 3. 사용 절차

### 3.1 cookie 인증 (Build Monitor → Build Server)

```bash
# 1) login — subject + role 로 토큰 발급. role=admin 요청은 admin allow-list 통과 필수.
curl -i -c cookies.txt -X POST http://127.0.0.1:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"subject":"admin","role":"admin"}'
# → 200 + Set-Cookie: auth_token=v2.<base64url>.<base64url>; HttpOnly; SameSite=Lax; Max-Age=28800

# 2) whoami — 현재 principal 조회
curl -i -b cookies.txt http://127.0.0.1:3000/auth/whoami
# → 200 + {"subject":"admin","role":"admin","jti":"...","expiresAt":"..."}

# 3) admin builds (cookie 인증)
curl -i -b cookies.txt http://127.0.0.1:3000/admin/builds
# → 200 + BuildSummary[]

# 4) logout — jti revoke + cookie 만료
curl -i -b cookies.txt -X POST http://127.0.0.1:3000/auth/logout
# → 204 + Set-Cookie: auth_token=; Max-Age=0
```

### 3.2 Bearer 인증 (Skill / CLI / 외부 도구)

```bash
# Build Monitor 가 fetch 시 baseUrl "/api" + cookie 자동 첨부하지만,
# Skill / CLI / runner 같은 외부 도구는 Authorization: Bearer 헤더 사용.

# 1) login + 토큰 추출
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"subject":"alice","role":"user"}' | jq -r '.token')
# → raw token (cookie 외). 토큰은 v2.<base64url(payload)>.<base64url(sig)> 형식.

# 2) 본인 빌드 조회
curl -i -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:3000/builds
# → 200 + 본인 (subject=alice) 의 BuildSummary[]

# 3) admin builds (cookie / Bearer 모두 동일)
curl -i -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:3000/admin/builds
# → role=admin 이고 subject 가 admin allow-list 에 있을 때만 200. 그 외 401/403.
```

### 3.3 legacy X-User-Id / X-Admin-Id 헤더 (마이그레이션 경로)

```bash
# legacy ON 환경 (AUTH_LEGACY_HEADERS=true) 에서만 동작.
# Build Server 가 cookie 인증 부재 시 X-User-Id / X-Admin-Id 헤더로 인증 시도.

# build-routes 의 owner policy: X-User-Id 가 admin allow-list 의 subject 면 admin role,
# 아니면 user role. legacyDefaultSubject env 가 "<anonymous>" 면 X-User-Id 부재 시
# 그 subject 로 동작 (self-dogfood 호환). 기본값 "" 라 X-User-Id 부재 시 401.

# admin-routes: X-Admin-Id 가 admin allow-list 의 seed/mutation 결과와 일치하면 통과.
# legacyHeaderValue !== null && !isAdmin(legacyHeaderValue) → 403 + callerId echo.
```

## 4. 운영 환경 배포 절차

신규 commit (Phase 1 4단계 봉인 = main HEAD 운영 메타 + 운영 가이드) 을 운영 환경에 적용할 때:

### 4.1 사전 점검

```bash
# 1) main HEAD + 직전 4 commit 의 의도 / 영향 검토
git log --oneline -n 5

# 2) workflow meta 동기성 — session-end 가드 9종
python3 ai-workflow/skills/session-end/scripts/run_session_end.py --workspace-root "$PWD"
# → 9/9 PASS

# 3) 회귀 baseline sanity
./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && \
  ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && \
  ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && \
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit && \
  (cd apps/build-monitor && ./node_modules/.bin/tsc -p tsconfig.react.json --noEmit)

# 4) build-server 회귀
cd apps/build-server && AUTH_HMAC_SECRET=test-secret node --import tsx --test tests/*.test.ts
# → 278/278 PASS
```

### 4.2 배포

```bash
# 운영 환경의 build-server / runner / build-monitor 이미지 rebuild + deploy.
# secret manager 가 AUTH_HMAC_SECRET 을 주입. dev/staging 과 분리된 secret 필수.
# 신규 env 가 5종 — secret manager 의 manifest 갱신 필요:
#   AUTH_HMAC_SECRET                  # 필수 (cookie 인증 활성)
#   AUTH_TOKEN_TTL_SECONDS            # 선택 (default 28800 = 8h)
#   AUTH_LEGACY_HEADERS               # 마이그레이션 경로 (운영 baseline false)
#   BUILD_OWNER_POLICY_LEGACY_DEFAULT_SUBJECT  # legacy ON 시 X-User-Id 부재 default subject
```

### 4.3 배포 후 검증 (운영 가이드 §3 의 절차 반복)

```bash
# health
curl -i http://<production-host>:3000/health
# → 200 + {"status":"ok"}

# whoami — cookie 인증 활성 확인
curl -i http://<production-host>:3000/auth/whoami
# → 401 + {"message":"Authentication required.","hint":"POST /auth/login to obtain a cookie."}

# cookie 인증 round-trip
curl -i -c /tmp/cookies.txt -X POST http://<production-host>:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"subject":"admin","role":"admin"}'
# → 200 + Set-Cookie: auth_token=v2.<...>; HttpOnly; SameSite=Lax
curl -i -b /tmp/cookies.txt http://<production-host>:3000/auth/whoami
# → 200 + admin principal
curl -i -b /tmp/cookies.txt http://<production-host>:3000/admin/builds
# → 200 + BuildSummary[]

# admin allow-list 비통과 → 403 + callerId echo
curl -i -X POST http://<production-host>:3000/auth/login \
  -H "content-type: application/json" \
  -d '{"subject":"alice","role":"user"}'
# → 200 (user role 발급)
curl -i -b /tmp/cookies.txt http://<production-host>:3000/admin/builds
# → 403 + {"message":"Admin role or allow-list membership required.","callerId":"alice"}

# owner mismatch → 403 (alice 의 빌드, bob 이 조회)
curl -i -b /tmp/cookies.txt http://<production-host>:3000/builds/<bob-build-id>
# → 403 + {"message":"Caller is not the build owner.","callerId":"alice"}
```

### 4.4 v1 토큰 호환성 (wire format 변경)

본 Phase 1 3단계 봉인에서 HMAC 토큰 wire format 이 `v1.<plain-utf8-payload>.<hex-sig>` 에서 `v2.<base64url(payload)>.<base64url(sig)>` 로 변경됐다. **v1 토큰은 reject**. 그 이유:

- v1 의 plain-utf8 payload 가 subject `yky.lee` 같은 `.` 포함 subject 를 가질 때 `split(".")` 가 payload 를 더 잘라 sig mismatch 가 발생하는 잠복 결함이 있다 (TASK-108 / 1·2단계 봉인 시점 발견).
- base64url encoding 으로 wire format 의 `.` 가 payload 의 `.` 와 충돌하지 않게 봉인.

**v1 토큰을 보유한 세션의 자가 복구 절차**:

1. Build Monitor client 가 cookie 만료 / 401 응답을 받으면 React 측 `userIdStore` 가 localStorage 의 userId 를 보존 (기존 logout 의 `clear()` 호출 없음).
2. 사용자가 "Switch user" / "Login" 클릭 시 React 측 `Login.tsx` 가 `/auth/login` 을 재호출해 새 v2 토큰을 발급받는다.
3. cookie 가 v2 wire format 으로 갱신되며 이후 모든 admin / builds 요청이 정상 통과.

**v1 deprecated + 운영자 책임**:

운영자가 self-hosted Build Monitor 의 외부 admin UI 를 멀티 세션 / 멀티 탭 으로 운영할 때 다음 책임을 진다:

- **세션 재로그인 의무**: 운영자가 의도적으로 legacy X-User-Id / X-Admin-Id 헤더 기반 UI 를 유지하는 경우, `localStorage` 의 userId 가 stale 이 되면 admin UI 가 `userIdStore.clear()` 호출 후 `/login` 으로 redirect 해야 한다. 자동 silent 재로그인은 보안 결함 (탈취된 stale userId 가 자동 복구됨) 이라 **수동 재로그인** 이 canonical.
- **cookie invalidation 정책**: Build Server 의 `POST /auth/logout` 이 jti revoke + Set-Cookie Max-Age=0 으로 정상 무효화. 멀티 탭 운영 시 한 탭의 logout 이 다른 탭에 즉시 반영되지 않으므로, 운영자가 모든 탭에서 logout 을 호출하거나 브라우저 종료로 일괄 만료시켜야 한다. follow-up TASK 에서 broadcast channel 또는 storage event 기반 cross-tab invalidation 검토.
- **Build Monitor UI 의 인증 표면 일관성**: 본 가이드의 `auth-routes.ts` 가 cookie 인증 OFF 환경에서 X-User-Id / X-Admin-Id 헤더 fallback 을 노출하지만, 운영자가 `AUTH_HMAC_SECRET` 미설정 시 cookie 인증 자체가 비활성화되어 admin 호출이 불가. 운영자는 **반드시 secret manager 셋업을 사전 검증**한 뒤 신규 배포를 시작해야 한다.

## 5. 사전 결함 + 보강 4건

| # | 결함 | 보강 | 단계 |
| --- | --- | --- | --- |
| 1 | `X-User-Id` / `X-Admin-Id` 평문 헤더 위조 가능 | HMAC 서명 Bearer cookie + principal preHandler 가 Build Server 진입 시 인증 | 1·2 |
| 2 | build-scoped 라우트 (`GET /builds/:id`, `POST /builds` 등) 무인증 → 다른 owner 위조 | `enforceOwnerPolicy` 가 모든 build-scoped 라우트에 통합 + body `requestedBy` 위조 차단 + 부재 404 | 3 |
| 3 | HMAC v1 wire format 의 `split(".")` 가 subject `.` 와 충돌 (`yky.lee`) → sig mismatch 잠복 | v2 base64url encoding 으로 형식 변경, v1 reject | 3 |
| 4 | admin-scoped 라우트 14종 의 inline 가드 반복 | `enforceAdminGuard` + `resolveAdminCallerId` helper 로 일원화 + 동일 envelope 재현 | 4 |

## 6. 운영 환경 baseline

| 항목 | 값 |
| --- | --- |
| 5 package.json version | `0.10.0` (TASK-131 정합, 본 TASK bump) |
| migration | `0001~0018` (변경 0) |
| HOSTING_BASE_HOST | 미설정 시 호스팅 비활성 (opt-in) |
| COOKIE_NAME | `auth_token` (HttpOnly + SameSite=Lax, production 시 Secure 추가) |
| COOKIE_TTL | 8h default (`AUTH_TOKEN_TTL_SECONDS` env 로 override) |
| HMAC algorithm | HMAC-SHA256 |
| HMAC payload encoding | base64url (URL-safe, no padding) |
| HMAC signature encoding | base64url (URL-safe, no padding) |
| COOKIE maxAgeSeconds | 28800 (8h) |
| node process revoke Set | 메모리 (재시작 시 revoke 상태 소실) — 운영 영향 0 (TTL 만료로 동일 효과) |

## 7. 한계와 follow-up

1. **메모리 revoke Set 의 프로세스 재시작 후 소실**: 본 TASK 는 in-memory revoke 만 지원. 운영자가 build-server 를 재시작하면 모든 jti revoke 가 초기화 — 하지만 TTL 8h 만료로 동일 효과. 영속 revoke (Redis / Postgres) 는 후속 TASK 에서 인프라 결정 후 별도 봉인.
2. **route-level preHandler 일원화**: 4단계 봉인에서 admin-routes 의 14개 라우트는 helper `enforceAdminGuard` 를 handler 내부에서 inline 호출. fastify route config 일원화 TASK 에서 route-level preHandler 활성화 (cookie admin 인증이 모든 admin 라우트 진입 시점에 강제) 를 별도 봉인. 본 TASK 의 inline helper 호출은 동일 envelope 을 재현하지만, 운영자가 새 admin 라우트를 추가할 때 helper 호출을 깜빡하면 인증 누출. follow-up 가드: admin 라우트 등록 시 preHandler 강제 lint 규칙 또는 build-server smoke 에 enforceAdminGuard 호출 검증 추가.
3. **SSO / JWT 마이그레이션**: 본 TASK 는 HMAC 자체 서명 토큰 — 외부 SSO / OIDC / JWT provider 와 연동은 후속 ADMIN-* task group 에서 다룬다. `AUTH_HMAC_SECRET` 의 외부 IdP 와의 매핑은 신규 feature 트리거.
4. **메모리 revoke Set 의 클러스터 단위 공유**: 멀티 build-server replica 운영 시 각 replica 의 revoke Set 이 독립 → 한 replica 의 logout 이 다른 replica 에 즉시 반영 안 됨. follow-up: postgres `revoked_jti` table 또는 Redis 공유 (운영 가드 §6 의 `PG_POOL_IDLE_TIMEOUT_MS` / Redis 의 connection pool 운영 가이드 별도 봉인).
5. **build-server 의 legacy 인증 fallback (X-User-Id / X-Admin-Id) 의 sunset 정책**: 운영자가 legacy ON 환경에서 cookie 인증으로 완전 전환하면 `AUTH_LEGACY_HEADERS` 를 false 로 되돌리고, 모든 클라이언트가 cookie 인증으로 동작하는지 모니터링. 일정 기간 (운영 권장 1 release cycle) 후 legacy 코드 경로 (resolveCaller 의 legacy fallback) 자체를 제거하는 sunset 결정. 본 TASK 범위 밖.

## 8. 결정

본 운영 가이드가 봉인된 4단계 + 운영 메타 정합 = v0.10.0 minor release 의 security baseline. 운영자는 본 가이드를 따라 신규 commit 적용 시 cookie 인증 round-trip + admin/builds owner 가드 + wire format v2 강제를 실측하고, v1 토큰 보유 세션의 자가 복구 절차를 사전에 안내해야 한다.