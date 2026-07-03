<!-- standard-ai-workflow-kit: local -->

# Repository Assessment

- 문서 목적: 현재 저장소 상태와 구현 착수 전 제약을 기록한다.
- 범위: 구조 현황, 구현 준비도, 즉시 필요한 다음 단계
- 대상 독자: AI 에이전트, 온보딩 개발자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03

## 1. 현재 상태 요약

- 저장소는 SDLC 문서 기준선과 초기 구현 스캐폴드가 공존하는 상태다.
- 루트에는 `apps/`, `packages/`, `docs/`, `ai-workflow/`가 있으며, Build Server / Runner / shared package 1차 골격이 이미 존재한다.
- 제품 컨셉은 저장소 기준 SDLC 문서로 정리되어 있으며, 시작점은 `docs/sdlc/01-mvp-onboarding.md`다.
- Git 저장소와 원격 저장소는 초기화되었고, 현재 단계는 문서 정합성 정리와 구현 후속 축이 병행되는 상태다.

## 2. 확인된 자산

- `README.md`
- `docs/PROJECT_PROFILE.md`
- `docs/sdlc/01-mvp-onboarding.md`
- `docs/sdlc/contracts/01-shared-build-contract-baseline.md`
- `docs/review/01-sdlc-review.md`
- `docs/report/02-sdlc-review-report.html`
- `ai-workflow/memory/active/*`
- `ai-workflow/workflow_kit/pyproject.toml`

## 3. 구현 준비도 평가

- 제품 방향: 정의됨
- MVP 범위: 정의됨
- 시스템 트랙 분리: 정의됨
- 도메인 모델: SDLC/SRS/contract 기준선까지 정의됨
- 애플리케이션 런타임: Build Server / Runner 스캐폴드와 memory/postgres smoke 기준까지 확보됨
- 로컬 실행/테스트 명령: `docs/PROJECT_PROFILE.md` 기준으로 정리됨

## 4. 즉시 필요한 다음 단계

- README, 보고 문서, legacy 루트 문서의 canonical source 정합성 마감
- Runner와 Docker 실행 흐름을 build/test/deploy 폐루프 기준으로 계속 구체화
- Skill/MCP 엔트리포인트와 stdio transport 정리
- TTL cleanup, phase history persistence, 외부 배포 연동 후속 결정 반영

## 5. 리스크

- 문서 canonical source와 legacy 문서가 다시 섞이면 구현자가 오래된 preview-first 모델을 읽을 수 있다.
- 서버, Runner, Skill/MCP를 동시에 확장하면 경계가 흐려질 수 있다.
- Docker 실행 정책, 임시 runtime 노출 방식, 외부 배포 프로토콜이 늦게 정해지면 Runner 구현이 흔들릴 수 있다.
