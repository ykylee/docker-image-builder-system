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

- 진행 현황: 로그아웃 및 사용자 전환 시 sessionStorage/localStorage에 남아 있는 accessToken을 함께 제거하도록 React 세션 수명 주기를 보강했다. 사용자 ID 로그인은 실제 IdP 토큰 발급 경로가 아니므로 토큰 임의 생성은 하지 않았다.
- 다음 세션 시작 포인트: 실제 IdP/session 발급 계약을 결정한 뒤 accessToken 저장 adapter와 인증 활성 브라우저 E2E를 연결한다.
- 남은 리스크:

## ✅ Outcome

- 작업 결과: AppHeader/AdminAccessDenied 15/15 PASS; pnpm check PASS; git diff --check PASS
- 후속 작업:
