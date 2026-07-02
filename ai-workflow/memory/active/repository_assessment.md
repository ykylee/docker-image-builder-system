<!-- standard-ai-workflow-kit: local -->

# Repository Assessment

- 문서 목적: 현재 저장소 상태와 구현 착수 전 제약을 기록한다.
- 범위: 구조 현황, 구현 준비도, 즉시 필요한 다음 단계
- 대상 독자: AI 에이전트, 온보딩 개발자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-02

## 1. 현재 상태 요약

- 저장소는 문서 중심의 초기 스캐폴드 상태다.
- 루트 기준 애플리케이션 소스 디렉터리는 아직 없다.
- 제품 컨셉은 외부 문서에서 충분히 정의되어 있으며, 이를 `docs/MVP_ONBOARDING.md`로 흡수했다.
- Git 저장소와 원격 저장소는 초기화되었고, 현재 단계는 문서 기반 설계 정리 상태다.

## 2. 확인된 자산

- `README.md`
- `docs/PROJECT_PROFILE.md`
- `docs/MVP_ONBOARDING.md`
- `ai-workflow/memory/active/*`
- `ai-workflow/workflow_kit/pyproject.toml`

## 3. 구현 준비도 평가

- 제품 방향: 정의됨
- MVP 범위: 정의됨
- 시스템 트랙 분리: 정의됨
- 도메인 모델: 초안만 존재
- 애플리케이션 런타임: 미구현
- 로컬 실행/테스트 명령: 미확정

## 4. 즉시 필요한 다음 단계

- 공통 도메인 계약 초안 작성
- 저장소 앱/패키지 구조 스캐폴드
- Build Server 기술 스택 결정
- Runner와 Docker 실행 환경 요구사항 확정
- Skill/MCP 엔트리포인트 구조 설계

## 5. 리스크

- 서버, Runner, Skill/MCP를 동시에 시작하면 경계가 흐려질 수 있다.
- Docker 실행 정책과 preview URL 노출 방식이 늦게 정해지면 Runner 구현이 흔들릴 수 있다.
