<!-- standard-ai-workflow-kit: v0.11.21-beta -->

> **⚠ Superseded (2026-07-03)**
> 이 문서는 초기 루트 컨셉 정리 초안이다. 현재 canonical 기준선은 [`docs/sdlc/02-concept-refinement.md`](./sdlc/02-concept-refinement.md)이다.
> 루트 문서는 과거 논의 흔적을 남기기 위한 포인터 역할만 수행한다.

# Legacy Concept Refinement Note

- 최신 컨셉 기준:
  - Skill/MCP는 입력 준비와 사용자 안내를 담당한다.
  - Build Server는 요청 수신, 상태 저장, 조회를 담당한다.
  - Runner는 source prepare, build, container test, external deployment 실행을 담당한다.
- 정책 경계와 책임 모델은 `docs/sdlc/02-concept-refinement.md` 및 `docs/sdlc/design/01-system-context-and-responsibilities.md`를 우선 참조한다.
- preview-first 표현은 현재 canonical scope를 대표하지 않으므로 본문형 설명은 제거한다.
