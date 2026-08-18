---
id: TASK-178
status: in_progress
created_at: 2026-08-16
source_anchor: generic-task-178
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-178 — admin-auth-enforcement

## 📝 Description

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-16
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `packages/shared-config/src/env.ts`
  - `packages/shared-config/src/runtime.ts`
  - `apps/build-server/src/app/create-app.ts`
  - `compose.dev.yaml`
  - `examples/k8s-control-plane.yaml`
  - `apps/build-server/tests/principal.test.ts`

- 작업 내용: 관리자 API를 X-Admin-Id 문자열 비교에서 실제 서명 principal 또는 OIDC/JWT 검증으로 전환한다.
- 완료 기준: 인증 없는 관리자 요청은 401이다.
- 완료 기준: admin role 없는 요청은 403이다.
- 완료 기준: 만료·위조·로그아웃 토큰 테스트가 통과한다.
- 완료 기준: Kubernetes Secret 기반 AUTH_SECRET/OIDC 설정과 OpenAPI security scheme이 반영된다.

## 🛠️ Implementation / Content

- 진행 현황: AUTH_MODE=legacy|required를 shared-config/runtime에 추가했다. required 모드는 AUTH_SECRET 부재 시 startup fail하며, Compose env와 Kubernetes control-plane Secret reference가 같은 설정을 전달한다. 기본 legacy는 Runner token 도입 전 호환을 유지한다.
- 다음 세션 시작 포인트: TASK-179 Runner bearer token/credential을 추가한 뒤 Compose/Kubernetes AUTH_MODE=required 전환 e2e와 관리자 token rotation을 검증한다.
- 남은 리스크: 외부 IdP 선택 전까지 발급·rotation 운영 절차가 필요하다.

## ✅ Outcome

- 작업 결과: 운영 승격 gate와 Secret plumbing 완료, Runner token·rotation·OIDC는 미완료.
- 검증 결과: workspace pnpm check PASS; principal/auth tests 7/7 PASS; Build Server 전체 테스트 PASS; git diff --check PASS.
- 후속 작업:
