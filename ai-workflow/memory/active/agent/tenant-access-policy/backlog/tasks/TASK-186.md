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
  - `apps/build-server/src/routes/oidc-routes.ts`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: 명시적으로 주입된 OIDC client/session store에 한해 /auth/login·callback·session·logout route를 등록하고 PKCE flow state, opaque Secure HttpOnly cookie, revoke lifecycle을 연결했다.
- 다음 세션 시작 포인트: 실제 provider/store 주입 경로와 React session bootstrap을 연결
- 남은 리스크: 기본 실행에는 provider/store가 없어 route가 비활성화되며, production store 구현이 필요

## ✅ Outcome

- 작업 결과: OIDC callback route foundation 구현 및 Fastify lifecycle 테스트 완료
- 검증 결과: build-server principal tests 15/15 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
