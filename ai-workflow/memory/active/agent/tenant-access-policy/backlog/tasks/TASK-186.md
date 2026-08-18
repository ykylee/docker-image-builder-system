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
  - `.omx/plans/task-185-oidc-http-session-contract.md`
  - `apps/build-server/src/auth/session-adapter.ts`
  - `packages/shared-config/src/env.ts`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: SessionAdapter를 비동기 verifyRequest({authorization,cookie}) 계약으로 전환하고 HMAC adapter를 정렬했다. SessionStore/MemorySessionStore에 opaque session TTL, revoke, one-time OIDC flow state 계약을 추가했다.
- 다음 세션 시작 포인트: 실제 IdP와 session store 선택 후 OIDC callback 및 cookie adapter 구현
- 남은 리스크: 실제 Redis/Postgres adapter와 provider claim mapping은 아직 미결정

## ✅ Outcome

- 작업 결과: provider-neutral runtime foundation 구현 완료
- 검증 결과: build-server principal tests 11/11 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
