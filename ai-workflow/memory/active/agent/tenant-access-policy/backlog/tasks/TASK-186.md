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
  - `apps/build-server/src/app/create-app.ts`
  - `apps/build-server/tests/principal.test.ts`
  - `compose.dev.oidc-keycloak.yaml`
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: OIDC_ADMIN_ROLE runtime/env 설정 추가; OIDC admin guard가 해당 role을 사용하고 non-OIDC 모드는 기존 admin role을 유지한다.
- 다음 세션 시작 포인트: Keycloak 연결 가능 환경에서 실제 realm role 이름과 admin smoke를 확인한 뒤 TASK-186 종료 검토.
- 남은 리스크: 실제 Keycloak realm의 role naming과 audience mapper는 네트워크 복구 전 미검증.

## ✅ Outcome

- 작업 결과: Keycloak custom role dib-admin 회귀를 추가하고 Compose overlay와 운영 문서를 갱신했다.
- 검증 결과: Build Server/Build Monitor typecheck PASS; principal.test.ts 20/20 PASS; Compose config with OIDC_ADMIN_ROLE=dib-admin PASS; git diff --check PASS.
- 후속 작업:
