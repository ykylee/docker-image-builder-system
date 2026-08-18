---
id: TASK-185
status: in_progress
created_at: 2026-08-18
source_anchor: generic-task-185
source_path: backlog/2026-08-18.md
kind: generic
---

# TASK-185 — identity-session-adapter

## 📝 Description

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-18
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: 실제 IdP/OIDC 또는 secure httpOnly session 도입 전 현재 HMAC principal 검증과 React 임시 Bearer bridge 사이의 교체 가능한 session adapter 계약을 정의한다.
- 완료 기준: session adapter 경계와 운영 선택지가 문서화되고 token 활성 시 React가 caller-supplied identity header를 전송하지 않으며 회귀 테스트가 유지됨

## 🛠️ Implementation / Content

- 진행 현황: token 활성 React 요청에서 X-User-Id/X-Admin-Id caller header를 제거하고 Authorization만 전송하도록 api helper를 정리했다. Build Server auth hook이 검증 principal에서 내부 호환 header를 파생한다. PROJECT_PROFILE에 adapter 경계를 기록했고 auth browser E2E가 header 부재와 owner policy를 검증한다.
- 다음 세션 시작 포인트: OIDC/httpOnly session adapter의 issuer/callback/session cookie 계약을 결정하고 서버·React 교체 지점을 설계한다.
- 남은 리스크:

## ✅ Outcome

- 작업 결과: auth Playwright E2E 1/1 PASS; frontend vitest 289/289 PASS; pnpm check PASS; git diff --check PASS
- 검증 결과: auth Playwright E2E 1/1 PASS; frontend vitest 289/289 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
