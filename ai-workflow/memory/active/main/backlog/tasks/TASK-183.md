---
id: TASK-183
status: in_progress
created_at: 2026-08-18
source_anchor: generic-task-183
source_path: backlog/2026-08-18.md
kind: generic
---

# TASK-183 — tenant-access-policy

## 📝 Description

- 상태: in_progress
- 우선순위: high
- 요청일: 2026-08-18
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: 인증 principal 기반 build/service tenant 조회 권한
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: React API helper에 accessToken Bearer 전달과 저장/삭제 helper를 추가했다. /services는 인증 admin 전체 목록, 일반 principal owner 목록으로 분기하며 legacy X-User-Id 호환을 유지한다. OpenAPI /services 보안 선언 테스트도 추가했다.
- 다음 세션 시작 포인트: 실제 IdP/session 발급 경로와 accessToken 저장 시점을 연결하고 인증 활성 브라우저 E2E를 수행한다.
- 남은 리스크:

## ✅ Outcome

- 작업 결과: pnpm check PASS; build-monitor vitest 289/289 PASS; build-server tests 257/257 PASS; principal tests 9/9 PASS; git diff --check PASS
- 검증 결과: pnpm check PASS; build-monitor vitest 289/289 PASS; build-server tests 257/257 PASS; principal tests 9/9 PASS; git diff --check PASS
- 후속 작업:
