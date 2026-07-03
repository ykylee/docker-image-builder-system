# Docker Build And Deployment Automation Platform SDLC Step 11 - PKG-003 Build Server Persistence Breakdown

- 문서 목적: `PKG-003 Build Server State And Queue Persistence`를 실제 구현 가능한 세부 태스크로 분해한다.
- 범위: schema, migration, repository contract, queue query, transaction boundary, log/event persistence
- 대상 독자: Build Server 구현자, DB 설계자, Runner 구현자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03

## 1. `PKG-003` 범위 재확인

목표:

- build queue와 test/deploy 결과 저장 구조를 정의한다.

핵심 범위:

- `build_request` schema
- `build_log` schema
- `build_test` schema
- `deployment_attempt` schema
- active build lookup과 queue pickup을 위한 repository contract
- persistence transaction boundary

## 2. 세부 태스크 개요

| 태스크 | 이름 |
| --- | --- |
| `PKG-003-A` | Build Request Schema Definition |
| `PKG-003-B` | Build Log Schema Definition |
| `PKG-003-C` | Build Test Schema Definition |
| `PKG-003-D` | Deployment Attempt Schema Definition |
| `PKG-003-E` | Migration Baseline |
| `PKG-003-F` | Active Build Lookup Repository Contract |
| `PKG-003-G` | Build Create Repository Contract |
| `PKG-003-H` | Queue Pickup Query Contract |
| `PKG-003-I` | Log/Event Persistence Contract |
| `PKG-003-J` | Transaction Boundary Policy |

## 3. 핵심 태스크 방향

- `PKG-003-C`는 컨테이너 테스트 결과 저장 구조를 닫는다.
- `PKG-003-D`는 외부 배포 결과 저장 구조를 닫는다.
- `PKG-003-H`는 build queue claim query 기준을 닫는다.
- `PKG-003-I`는 Runner가 phase와 log를 어떤 순서로 저장할지 정리한다.

## 4. 구현 순서 권장

1. `PKG-003-A`, `PKG-003-B`, `PKG-003-C`, `PKG-003-D`
2. `PKG-003-E`
3. `PKG-003-F`, `PKG-003-G`
4. `PKG-003-H`
5. `PKG-003-I`
6. `PKG-003-J`

## 5. 현 단계 결론

- `PKG-003`은 이제 build/test/deploy 저장 구조와 queue query, transaction boundary 수준의 실제 구현 태스크로 분해되었다.
