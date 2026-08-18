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
  - `apps/build-server/src/auth/oidc-client.ts`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: Implement provider-neutral async session adapter and server-side session store contract without selecting a concrete IdP; preserve HMAC Runner compatibility and fail closed in AUTH_MODE=oidc.
- 완료 기준: Async request-based SessionAdapter contract is implemented with HMAC compatibility.
- 완료 기준: SessionStore interface covers create, lookup, revoke, TTL and transient OIDC state.
- 완료 기준: No concrete provider or secret values are hard-coded; AUTH_MODE=oidc fails closed when dependencies are absent.
- 완료 기준: Unit and integration tests cover cookie/session lifecycle and existing HMAC Runner path.

## 🛠️ Implementation / Content

- 진행 현황: 표준 OIDC discovery, authorization-code+PKCE(S256), issuer/audience/JWKS/nonce 검증, principal 정규화 client를 추가하고 jose 의존성을 Build Server에 연결했다.
- 다음 세션 시작 포인트: OIDC provider 및 session store 선택 후 /auth/login·callback·logout route 연결
- 남은 리스크: 실제 provider callback, Redis/Postgres store, role claim mapping 미결정

## ✅ Outcome

- 작업 결과: provider-neutral OIDC client foundation 구현 완료; callback route 연결 전 단계
- 검증 결과: build-server principal tests 14/14 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
