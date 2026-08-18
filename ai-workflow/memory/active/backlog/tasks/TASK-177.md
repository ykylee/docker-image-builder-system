---
id: TASK-177
status: done
created_at: 2026-08-16
source_anchor: generic-task-177
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-177 — public-build-intake-boundary

## 📝 Description

- 상태: done
- 우선순위: critical
- 요청일: 2026-08-16
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `apps/build-server/src/app/create-app.ts`
  - `apps/build-server/src/routes/build-routes.ts`
  - `apps/build-server/src/app/openapi.ts`
  - `apps/build-server/tests/principal.test.ts`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: 불특정 사용자의 build 제출 요구를 보존하면서 공개 build intake와 관리자·Runner 제어 API의 경계를 명확히 고정한다.
- 완료 기준: 공개 build 제출·source 업로드·상태 조회가 인증 없이 동작한다.
- 완료 기준: /admin/*와 claim/phase/container-test/deployment 제어 API가 공개 intake 예외에 포함되지 않는다.
- 완료 기준: OpenAPI와 운영 문서가 공개/보호 경계를 동일하게 설명한다.
- 완료 기준: 공개 build 목록·상세·source 노출 정책을 문서로 확정한다.

## 🛠️ Implementation / Content

- 진행 현황: 공개 build intake와 보호 control API를 runtime hook과 OpenAPI 계약에 반영했다.
- 다음 세션 시작 포인트: TASK-178 관리자 인증 강제와 배포 secret 연동을 시작한다.
- 남은 리스크: GET /builds가 전체 사용자 build를 반환할 수 있어 데이터 공개 범위를 명시해야 한다.

## ✅ Outcome

- 작업 결과: 공개 build 목록/상세/로그/source를 공개 정책으로 확정하고, Runner/Admin operation에는 bearerAuth를 OpenAPI security requirement로 표시했다.
- 검증 결과: Build Server typecheck PASS; principal/auth boundary test 5/5 PASS; 전체 Build Server 247/247 PASS; git diff --check PASS.
- 후속 작업:
