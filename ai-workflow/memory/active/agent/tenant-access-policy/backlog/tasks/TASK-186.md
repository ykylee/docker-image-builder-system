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

- 진행 현황: PostgresSessionStore와 auth_session/auth_oidc_flow migration을 추가하고 AUTH_MODE=oidc 부팅 시 Postgres store·OIDC client를 명시적으로 주입하도록 index runtime wiring을 연결했다.
- 다음 세션 시작 포인트: Postgres migration 실DB 검증과 provider-specific browser E2E 실행
- 남은 리스크: 실제 issuer/JWKS 네트워크 및 provider claim mapping 검증 필요

## ✅ Outcome

- 작업 결과: OIDC production wiring foundation 구현 완료; 실제 IdP 외부 연동 전 마지막 단계
- 검증 결과: build-server principal tests 15/15 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
