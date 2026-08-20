---
id: TASK-186
status: in_progress
created_at: 2026-08-18
source_anchor: generic-task-186
source_path: backlog/2026-08-18.md
kind: generic
---

# TASK-186 — oidc-session-runtime-foundation

## 📝 Description

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-18
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `packages/shared-config/src/env.ts`
  - `packages/shared-config/src/runtime.ts`
  - `apps/build-server/src/auth/oidc-client.ts`
  - `apps/build-server/src/index.ts`
  - `apps/build-server/tests/principal.test.ts`
  - `compose.dev.oidc-keycloak.yaml`
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: ID token은 client ID audience를 유지하고 access token audience를 OIDC_ACCESS_TOKEN_AUDIENCE로 분리했다. 미설정 시 client ID fallback.
- 다음 세션 시작 포인트: Keycloak 연결 가능 환경에서 실제 audience mapper와 realm role smoke를 확인한 뒤 TASK-186 종료 검토.
- 남은 리스크: 실제 Keycloak access token aud 값과 audience mapper는 네트워크 복구 전 미검증.

## ✅ Outcome

- 작업 결과: fake issuer access token aud=keycloak-api 회귀와 shared runtime 설정을 추가했다.
- 검증 결과: Build Server/Build Monitor typecheck PASS; principal.test.ts 20/20 PASS; Compose explicit/default audience config PASS; git diff --check PASS.
- 후속 작업:
