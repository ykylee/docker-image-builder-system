# Docker Build And Deployment Automation Platform SDLC Step 14 - Backend Development Target Selection

- 문서 목적: 백엔드 개발 착수 직전, 실제로 먼저 구현할 대상과 뒤로 미룰 대상을 코드 단위로 재정리한다.
- 범위: 1차 착수 대상, 후속 착수 대상, 제외 대상, 선정 기준, 즉시 다음 액션
- 대상 독자: 프로젝트 리드, Build Server 구현자, Runner 구현자, AI 에이전트
- 상태: draft
- 최종 수정일: 2026-07-03

## 1. 1차 착수 대상

1. root workspace / toolchain skeleton
2. `packages/shared-contract`
3. `packages/shared-config`
4. `packages/db`
5. `apps/build-server`

## 2. 2차 착수 대상

6. `apps/runner` Go skeleton
7. container test implementation
8. external deployment adapter

## 3. 3차 이후 대상

- Skill/MCP client
- 추가 배포 프로토콜
- 다중 Runner 확장

## 4. 선정 원칙

- 먼저 만드는 대상은 후속 모든 구현의 canonical source 역할을 해야 한다.
- Build Server P0를 여는 데 직접 기여하지 않는 기능은 1차 착수군에서 뺀다.
- Runner는 반드시 열되, test/deploy 정책까지 한 번에 열지는 않는다.

## 5. 현 단계 결론

- 이번 백엔드 개발의 실제 착수 대상은 `workspace -> shared-contract -> shared-config -> db -> build-server` 이고, 그 다음은 `apps/runner`와 test/deploy 실행 계층이다.
