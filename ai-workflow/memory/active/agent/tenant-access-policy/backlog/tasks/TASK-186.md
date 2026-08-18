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
  - `apps/build-server/src/auth/postgres-session-store.ts`
  - `apps/build-server/migrations/0019_auth_session.sql`
  - `apps/build-server/src/index.ts`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: ephemeral fake OIDC issuer를 사용해 discovery·PKCE token exchange·RS256 JWKS·issuer/audience/nonce 검증·principal 정규화의 실제 HTTP 왕복 E2E를 추가했다.
- 다음 세션 시작 포인트: 실제 IdP issuer와 role claim mapping을 확정하고 production browser E2E로 전환
- 남은 리스크: fake issuer는 외부 IdP cookie/redirect 정책을 검증하지 않음

## ✅ Outcome

- 작업 결과: provider-neutral OIDC client E2E 검증 완료
- 검증 결과: build-server principal tests 17/17 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
