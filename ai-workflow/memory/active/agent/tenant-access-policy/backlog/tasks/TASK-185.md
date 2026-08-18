---
id: TASK-185
status: done
created_at: 2026-08-18
source_anchor: generic-task-185
source_path: backlog/2026-08-18.md
kind: generic
---

# TASK-185 — identity-session-adapter

## 📝 Description

- 상태: done
- 우선순위: high
- 요청일: 2026-08-18
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `.omx/plans/task-185-oidc-http-session-contract.md`
  - `docs/PROJECT_PROFILE.md`
-

- 작업 내용: 실제 IdP/OIDC 또는 secure httpOnly session 도입 전 현재 HMAC principal 검증과 React 임시 Bearer bridge 사이의 교체 가능한 session adapter 계약을 정의한다.
- 완료 기준: session adapter 경계와 운영 선택지가 문서화되고 token 활성 시 React가 caller-supplied identity header를 전송하지 않으며 회귀 테스트가 유지됨

## 🛠️ Implementation / Content

- 진행 현황: OIDC authorization-code+PKCE, opaque Secure HttpOnly session cookie, server-side session store, async SessionAdapter request contract, React token bridge removal, HMAC Runner compatibility, and fail-closed rules documented.
- 다음 세션 시작 포인트: TASK-186에서 provider-neutral async adapter와 session store contract 구현
- 남은 리스크: Provider claim drift, reverse-proxy Secure cookie 설정, session store 장애 시 fail-open 가능성

## ✅ Outcome

- 작업 결과: 설계 문서와 acceptance/verification/pre-mortem을 작성하고 1차 adapter 구현 및 회귀 검증을 완료했다.
- 검증 결과: principal tests 10/10 PASS; auth Playwright E2E 1/1 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업: TASK-186
