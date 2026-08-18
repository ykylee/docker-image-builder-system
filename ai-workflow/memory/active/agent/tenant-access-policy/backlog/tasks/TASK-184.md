---
id: TASK-184
status: done
created_at: 2026-08-18
source_anchor: generic-task-184
source_path: backlog/2026-08-18.md
kind: generic
---

# TASK-184 — auth-contract-and-e2e

## 📝 Description

- 상태: done
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

- 진행 현황: 인증 계약 문서·OpenAPI 회귀·Playwright browser harness·nightly CI job을 모두 반영했고 원격 auth-browser-e2e 및 e2e/local job이 성공했다.
- 다음 세션 시작 포인트: TASK-185: 실제 OIDC/httpOnly session adapter 계약을 결정하고 fixture token 경로를 운영 인증으로 교체한다.
- 남은 리스크:

## ✅ Outcome

- 작업 결과: public build/source submission, owner read, cross-tenant 404, logout token cleanup을 테스트 전용 signed fixture token으로 브라우저 HTTP에서 검증하고 CI/nightly에 연결했다.
- 검증 결과: auth browser e2e CI success; e2e/local CI success; local auth Playwright 1/1 PASS; frontend vitest 289/289 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
