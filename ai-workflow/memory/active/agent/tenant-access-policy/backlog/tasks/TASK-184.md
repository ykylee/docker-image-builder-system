---
id: TASK-184
status: in_progress
created_at: 2026-08-18
source_anchor: generic-task-184
source_path: backlog/2026-08-18.md
kind: generic
---

# TASK-184 — auth-contract-and-e2e

## 📝 Description

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-18
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: public build 제출과 protected 조회의 인증 계약을 문서·OpenAPI·회귀 테스트에 고정하고 실제 IdP 연동 전 임시 client bridge의 한계를 명시한다.
- 완료 기준: PROJECT_PROFILE 및 readiness roadmap의 인증 정책이 코드와 일치하고 principal 회귀 테스트가 계약을 고정하며 임시 Bearer bridge의 운영 제한이 명시됨

## 🛠️ Implementation / Content

- 진행 현황: nightly-e2e workflow에 auth-browser-e2e job을 추가해 테스트 전용 signed fixture token 기반 Playwright 계약 테스트를 CI/nightly로 연결했다. 로컬 test:e2e:auth 명령과 Project Profile 운영 문서도 갱신했다.
- 다음 세션 시작 포인트: CI에서 auth-browser-e2e 실제 실행을 확인하고, OIDC/httpOnly session adapter가 확정되면 fixture token을 교체한다.
- 남은 리스크:

## ✅ Outcome

- 작업 결과: auth Playwright E2E 1/1 PASS; frontend vitest 289/289 PASS; pnpm check PASS; git diff --check PASS
- 검증 결과: auth Playwright E2E 1/1 PASS; frontend vitest 289/289 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
