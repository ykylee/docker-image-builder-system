# Workers

- 문서 목적: skill 카탈로그에 정식 등록되지 않은 보조 실행 스크립트를 모은다.
- 범위: `backlog_steward.py`
- 대상 독자: AI agent 설계자, 개발자
- 상태: prototype
- 최종 수정일: 2026-06-09
- 관련 문서: `../README.md`, `../../core/workflow_skill_catalog.md`

## 현재 포함된 스크립트

- [`backlog_steward.py`](./backlog_steward.py): 백로그 디렉터리의 태스크 문서를 일괄 정리하는 프로토타입. 제목, 메타데이터 헤더를 표준 포맷으로 재작성하며 `--apply` 플래그로 실제 파일 수정을 수행한다. `workflow_kit.__version__` 기반 `tool_version` 을 출력 envelope 에 포함한다.

## 다음에 읽을 문서

- skill 허브: [../README.md](../README.md)
