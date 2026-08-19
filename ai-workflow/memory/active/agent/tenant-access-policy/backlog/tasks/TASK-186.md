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
  - `compose.dev.oidc-keycloak.yaml`
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: Keycloak 전용 선택 overlay 추가: AUTH_MODE=oidc, Postgres backend, realm_access.roles, secure session cookie와 issuer/client/secret/redirect URI 명시 주입.
- 다음 세션 시작 포인트: Keycloak realm 네트워크가 준비되면 실제 login/callback/logout 및 admin role smoke를 실행한다.
- 남은 리스크: 현재 환경에서는 외부 issuer 도달성 및 실제 client 설정을 검증할 수 없음.

## ✅ Outcome

- 작업 결과: 외부 Keycloak 연결 없이 compose config 렌더링과 git diff --check 검증 완료.
- 검증 결과: docker compose -f compose.dev.yaml -f compose.dev.oidc-keycloak.yaml config PASS (placeholder env); git diff --check PASS.
- 후속 작업:
