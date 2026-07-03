# Docker Build And Deployment Automation Platform SDLC Step 12 - PKG-004 Build Server Query API Breakdown

- 문서 목적: `PKG-004 Build Server Query API`를 실제 구현 가능한 세부 태스크로 분해한다.
- 범위: status query endpoint, log query endpoint, response assembly, test/deploy exposure, error/404 policy
- 대상 독자: Build Server 구현자, API 설계자, Skill/MCP 구현자, 프로젝트 리드
- 상태: draft
- 최종 수정일: 2026-07-03

## 1. `PKG-004` 범위 재확인

목표:

- build 상태, 로그, test/deploy 정보를 조회하는 최소 API 기준을 정한다.

핵심 범위:

- `GET /builds/{buildId}`
- `GET /builds/{buildId}/logs`
- `GET /jobs/{jobId}`
- 상태 조회 응답 조립
- 로그 조회 응답 조립
- test/deploy 상태 노출 규칙

## 2. 세부 태스크 개요

| 태스크 | 이름 |
| --- | --- |
| `PKG-004-A` | Build Status Route Registration |
| `PKG-004-B` | Build Status Query Schema |
| `PKG-004-C` | Build Status Response Assembly |
| `PKG-004-D` | Build Status Repository Contract |
| `PKG-004-E` | Test / Deploy Exposure Policy |
| `PKG-004-F` | Job Polling Facade |
| `PKG-004-G` | Build Log Route Registration |
| `PKG-004-H` | Build Log Query Schema |
| `PKG-004-I` | Build Log Repository Contract |
| `PKG-004-J` | Not Found / Error Policy |

## 3. 핵심 태스크 방향

- 상태 조회 응답은 `build`, `test`, `deploy`, `error`를 함께 조립한다.
- `GET /jobs/{jobId}`는 polling consumer용 facade로 둔다.
- test/deploy 미존재 상태는 nullable 또는 `NOT_STARTED`로 정리한다.

## 4. 구현 순서 권장

1. `PKG-004-B`, `PKG-004-H`
2. `PKG-004-D`, `PKG-004-I`
3. `PKG-004-C`, `PKG-004-E`, `PKG-004-F`
4. `PKG-004-J`
5. `PKG-004-A`, `PKG-004-G`

## 5. 현 단계 결론

- `PKG-004`는 이제 status query, log query, response assembly, test/deploy exposure, polling facade, error policy 수준의 실제 구현 태스크로 분해되었다.
