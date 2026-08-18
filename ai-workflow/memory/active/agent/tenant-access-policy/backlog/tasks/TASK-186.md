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
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `apps/build-server/src/auth`
  - `apps/build-monitor/react`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: HTTPS를 사용하지 않는 운영 결정에 맞춰 SESSION_COOKIE_SECURE 기본값을 false로 분리하고 HttpOnly/SameSite/Origin 검증은 유지했다.
- 다음 세션 시작 포인트: 실제 IdP issuer/role claim을 주입한 HTTP production browser OIDC E2E
- 남은 리스크: HTTP 세션은 네트워크 구간 암호화를 제공하지 않으므로 내부 신뢰 네트워크 전용이며 외부 노출 금지

## ✅ Outcome

- 작업 결과: shared-config/build-server tsc --noEmit PASS; principal 18/18 PASS; Playwright auth-contract 1/1 PASS; git diff --check PASS
- 검증 결과: shared-config/build-server tsc --noEmit PASS; principal 18/18 PASS; Playwright auth-contract 1/1 PASS; git diff --check PASS
- 후속 작업:
