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
  - `apps/build-server/src/auth/oidc-client.ts`
  - `apps/build-server/tests/principal.test.ts`
  - `docs/PROJECT_PROFILE.md`
  - `docs/operations/keycloak-oidc-deployment-2026-08-18.md`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: Keycloak 스타일 access_token의 realm_access.roles를 검증된 fallback source로 지원하고 ID/access token sub 불일치를 거부한다.
- 다음 세션 시작 포인트: Keycloak 연결 가능 환경에서 실제 realm login/callback/logout 및 admin role smoke를 실행하고 TASK-186을 종료한다.
- 남은 리스크: 현재 외부 Keycloak 네트워크가 없어 실제 issuer/client mapper 설정은 미검증.

## ✅ Outcome

- 작업 결과: ID token에는 role 없음, access token에 realm_access.roles만 있는 fake issuer 회귀를 추가했다.
- 검증 결과: Build Server typecheck PASS; Build Monitor React typecheck PASS; principal.test.ts 20/20 PASS; OIDC browser E2E 1/1 PASS; git diff --check PASS.
- 후속 작업:
