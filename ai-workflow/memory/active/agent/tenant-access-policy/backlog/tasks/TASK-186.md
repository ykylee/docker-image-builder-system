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

- 진행 현황: 기존 dibs-postgres를 일시 기동해 migration 0019의 두 테이블/인덱스 생성과 session·OIDC flow insert/select/delete 왕복을 실제 검증하고 컨테이너를 stopped 상태로 복원했다.
- 다음 세션 시작 포인트: 실제 OIDC issuer/JWKS provider browser E2E 검증
- 남은 리스크: 실제 provider endpoint 및 role claim mapping 미결정

## ✅ Outcome

- 작업 결과: migration 0019 실DB 왕복 검증 완료
- 검증 결과: real Postgres migration/session round-trip PASS; build-server principal tests 16/16 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
