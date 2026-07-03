<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# Report 디렉토리 인덱스

- 문서 목적: `docs/report/` 아래 산출물의 정체와 진화 이력을 한 곳에 정리해 세션 복원 시 혼동을 줄인다.
- 범위: 각 파일의 작성 시점 의미, 후속 세션에서 어떤 canonical source를 따라야 하는지
- 대상 독자: AI 에이전트, 온보딩 담당자, 보고 검토자
- 상태: stable
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/01-mvp-onboarding.md`, `docs/review/01-sdlc-review.md`, `ai-workflow/memory/active/session_handoff.md`

## 1. 산출물

| 파일 | TASK | 작성 시점 의미 | 후속 권장 canonical |
| --- | --- | --- | --- |
| `01-assignment-plan.md` | TASK-015 (초안) → TASK-018 (재작성) | 프로젝트 개요·구성·추진 전략·예상 산출물을 한 번에 설명하는 기획안. Build Server 착수 메모에서 프로젝트 기획안으로 재구성됨. | 본 문서를 과제 기획/보고 canonical로 사용 |
| `02-sdlc-review-report.html` | TASK-015 (초안) → TASK-019/020/021 (재작성) | 파일명은 SDLC 리뷰 보고의 잔재이지만, 현 내용은 "리더 소개 및 승인안" 슬라이드 데크. hero / 개요 / 흐름 / 시스템 구성 / 필요성 / 범위 / 추진 단계 / 산출물 / 리스크 / 의사결정 포인트 12슬라이드. | 본 문서를 발표/승인안 자료 canonical로 사용. SDLC 리뷰 본문 보고가 필요하면 `docs/review/01-sdlc-review.md`를 가리킬 것 |

## 2. 진화 요약

- TASK-015: `01-assignment-plan.md`와 `02-sdlc-review-report.html` 초안 작성 (각각 Build Server 착수 메모, SDLC 리뷰 보고 톤)
- TASK-018: `01-assignment-plan.md`를 프로젝트 개요 중심 기획안으로 전면 재구성
- TASK-019: `02-sdlc-review-report.html`을 검토 결과 보고서 톤에서 구현 착수 기획안 톤으로, 이어서 리더 브리프형 slide deck으로 재작성
- TASK-020: CSS 강화 + 인라인 SVG 자산 내장화로 오프라인 완결형 자료로 보강
- TASK-021: hero / overview / flow / scope / roadmap / conclusion 카피를 더 짧고 직접적인 "소개 및 승인안" 톤으로 압축

## 3. 다음에 읽을 문서

- `docs/review/01-sdlc-review.md`: SDLC 리뷰 findings의 canonical
- `ai-workflow/memory/active/session_handoff.md`: Key Changes 섹션의 보고 패키지 변천 이력
- `ai-workflow/memory/active/backlog/2026-07-03.md`: TASK-015, TASK-018~021 상세
