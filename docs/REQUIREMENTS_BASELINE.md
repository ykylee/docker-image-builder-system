# Docker Build Preview Platform Requirements Baseline

- 문서 목적: 현재까지의 컨셉 문서를 SDLC 요구사항 기준선으로 정리한다.
- 범위: 문제 정의, 사용자 요구사항, 시스템 요구사항, 비기능 요구사항, 제약, 미결정 항목
- 대상 독자: 프로젝트 리드, 기획자, AI 에이전트, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/03-requirements-baseline.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`, `docs/PREVIEW_POLICY.md`, `docs/IDENTITY_MODEL.md`, `docs/GLOSSARY_AND_STATE_MODEL.md`

## 1. 문서 목적과 사용 방식

이 문서는 컨셉 단계에서 정리한 방향을 SDLC의 "요구사항 도출 및 정제" 결과물로 변환한 기준선이다.

이 문서의 역할:

- 이후 설계 문서의 입력 기준
- 기능 범위 결정의 기준
- 정책 미결정 항목 추적의 기준
- 구현 착수 전 합의 문서

## 2. 문제 정의

비개발자 사용자는 AI 에이전트를 통해 애플리케이션을 만들 수 있어도, Docker 이미지 빌드와 테스트 실행 환경을 직접 다루기는 어렵다.

따라서 시스템은 사용자가 Docker 지식 없이도 다음 요청을 할 수 있도록 지원해야 한다.

```text
"배포해줘"
```

이 요청은 단순한 빌드 요청이 아니라, "테스트 가능한 URL을 받아 실행 결과를 확인하고 싶다"는 사용자 목적을 포함한다.

## 3. 목표와 비목표

### 3.1 목표

- 사용자가 자연어로 배포 요청을 할 수 있어야 한다.
- AI 에이전트가 배포 입력물을 준비할 수 있어야 한다.
- Build Server가 빌드 요청을 추적 가능한 작업으로 저장할 수 있어야 한다.
- Runner가 이미지를 빌드하고 preview를 실행할 수 있어야 한다.
- 사용자는 최종적으로 테스트 가능한 preview URL을 받아야 한다.
- 실패 시 사용자는 이해 가능한 실패 설명을 받아야 한다.

### 3.2 비목표

- 초기 단계에서 프로덕션 배포까지 완결하는 것
- 초기 단계에서 다중 Runner 병렬 처리까지 확정하는 것
- 초기 단계에서 reverse proxy 기반 preview URL을 필수화하는 것
- 초기 단계에서 registry push 및 deployment registration까지 MVP 필수 범위로 넣는 것

## 4. 이해관계자와 사용자

### 4.1 1차 사용자

- 비개발자 사용자
  - Dockerfile, 포트 매핑, 컨테이너 실행 명령을 몰라도 된다.
  - AI 에이전트와 대화하면서 앱을 만들고 배포를 요청한다.
  - 최종적으로 preview URL에서 결과를 확인한다.

### 4.2 시스템 행위자

- AI 에이전트 / Skill / MCP
- Build Server
- Build Runner
- 플랫폼 운영자

## 5. 사용자 시나리오

### 5.1 기본 성공 시나리오

1. 사용자가 AI 에이전트에게 앱 개발을 완료한 뒤 "배포해줘"라고 요청한다.
2. AI 에이전트는 앱 산출물 위치와 앱 이름을 확인한다.
3. AI 에이전트는 `Dockerfile`과 `.dockerignore`를 확인하거나 준비한다.
4. AI 에이전트는 소스와 metadata를 Build Server에 전달한다.
5. Build Server는 요청을 저장하고 build 상태를 추적한다.
6. Runner는 요청을 처리해 이미지를 빌드한다.
7. Runner는 preview 컨테이너를 실행한다.
8. 시스템은 preview URL을 생성한다.
9. AI 에이전트는 사용자에게 preview URL과 상태를 안내한다.

### 5.2 중복 빌드 시나리오

1. 같은 `userId + appName`에 대해 이미 active build가 존재한다.
2. 신규 요청은 별도 build를 만들지 않는다.
3. 시스템은 기존 build 정보를 반환한다.
4. AI 에이전트는 기존 작업이 진행 중임을 사용자에게 설명한다.

### 5.3 실패 시나리오

1. 이미지 빌드 또는 preview 실행 중 오류가 발생한다.
2. 시스템은 실패 상태와 관련 오류 정보를 기록한다.
3. AI 에이전트는 실패 원인을 사용자 친화적으로 요약한다.
4. 사용자는 다음 조치 방향을 안내받는다.

## 6. 기능 요구사항

기능 요구사항은 `FR-*` 형식으로 식별한다.

### 6.1 사용자 요청 및 입력 준비

- `FR-001` 시스템은 사용자의 자연어 배포 요청을 인식할 수 있어야 한다.
- `FR-002` 시스템은 현재 개발 산출물의 소스 루트를 식별할 수 있어야 한다.
- `FR-003` 시스템은 앱 이름을 확인하거나 제안할 수 있어야 한다.
- `FR-004` 시스템은 `Dockerfile` 존재 여부를 확인할 수 있어야 한다.
- `FR-005` 시스템은 `Dockerfile`이 없을 경우 생성 정책에 따라 준비할 수 있어야 한다.
- `FR-006` 시스템은 `.dockerignore`를 확인하거나 생성할 수 있어야 한다.
- `FR-007` 시스템은 빌드에 필요한 소스와 metadata를 압축 또는 패키징할 수 있어야 한다.

### 6.2 Build Server 요구사항

- `FR-008` Build Server는 빌드 요청을 수신할 수 있어야 한다.
- `FR-009` Build Server는 빌드 요청을 DB에 저장할 수 있어야 한다.
- `FR-010` Build Server는 동일 `userId + appName` 기준 active build 존재 여부를 판정할 수 있어야 한다.
- `FR-011` active build가 있으면 신규 build를 생성하지 않고 기존 작업 정보를 반환해야 한다.
- `FR-012` active build가 없으면 신규 build를 `QUEUED` 상태로 등록해야 한다.
- `FR-013` Build Server는 build 상태를 조회할 수 있는 API를 제공해야 한다.
- `FR-014` Build Server는 build 로그를 조회할 수 있는 API를 제공해야 한다.
- `FR-015` Build Server는 preview URL과 preview 상태 정보를 반환할 수 있어야 한다.

### 6.3 Runner 요구사항

- `FR-016` Runner는 `QUEUED` 상태의 작업을 순차적으로 가져올 수 있어야 한다.
- `FR-017` Runner는 작업 선점 시 상태를 적절히 전이시킬 수 있어야 한다.
- `FR-018` Runner는 소스 압축 해제와 작업 디렉터리 준비를 수행할 수 있어야 한다.
- `FR-019` Runner는 Docker 이미지 빌드를 수행할 수 있어야 한다.
- `FR-020` Runner는 빌드 로그를 저장할 수 있어야 한다.
- `FR-021` Runner는 빌드 성공 후 preview 컨테이너를 실행할 수 있어야 한다.
- `FR-022` Runner는 preview URL 생성에 필요한 host/port 정보를 기록할 수 있어야 한다.
- `FR-023` Runner는 preview readiness를 확인할 수 있어야 한다.
- `FR-024` Runner는 실패 시 오류 코드/메시지와 실패 단계를 기록할 수 있어야 한다.

### 6.4 사용자 상태 안내 요구사항

- `FR-025` 시스템은 build 상태를 사용자 친화적 메시지로 번역할 수 있어야 한다.
- `FR-026` 시스템은 `TEST_READY` 또는 동등 상태에서 preview URL을 사용자에게 안내할 수 있어야 한다.
- `FR-027` 시스템은 실패 시 사용자에게 원인 요약과 다음 조치를 함께 안내할 수 있어야 한다.

## 7. 비기능 요구사항

비기능 요구사항은 `NFR-*` 형식으로 식별한다.

### 7.1 사용성

- `NFR-001` 사용자는 Docker 지식을 요구받지 않아야 한다.
- `NFR-002` 사용자 메시지는 상태 코드보다 행동 가능한 설명을 우선해야 한다.

### 7.2 추적 가능성

- `NFR-003` 모든 build는 고유 `buildId`로 추적 가능해야 한다.
- `NFR-004` 모든 주요 상태 전이는 DB에 기록 가능해야 한다.
- `NFR-005` 실패 원인을 운영자가 추적할 수 있는 수준의 로그가 남아야 한다.

### 7.3 일관성

- `NFR-006` 동일 `userId + appName`에 대해 동시에 하나의 active build만 허용해야 한다.
- `NFR-007` build 상태와 preview 상태는 분리되어 관리되어야 한다.

### 7.4 확장성

- `NFR-008` preview URL 모델은 host+port에서 path/subdomain 기반으로 확장 가능해야 한다.
- `NFR-009` 단일 Runner 정책은 초기 기본값이지만 향후 다중 Runner로 확장 가능한 모델이어야 한다.

### 7.5 운영성

- `NFR-010` preview는 만료 또는 교체 정책에 따라 정리 가능해야 한다.
- `NFR-011` 운영 정책이 확정되기 전까지 시스템은 preview 보안과 공개 범위를 문서로 명시해야 한다.

## 8. 데이터 및 상태 요구사항

- `DR-001` 시스템은 최소 `build_request`, `build_log`, `test_deployment` 수준의 데이터 모델을 가져야 한다.
- `DR-002` build 상태 모델은 `RECEIVED`부터 `COMPLETED/FAILED/CANCELLED`까지 추적 가능해야 한다.
- `DR-003` preview 상태 모델은 `QUEUED`, `RESERVED`, `STARTING`, `READY`, `FAILED`, `STOPPED`, `EXPIRED`를 다룰 수 있어야 한다.
- `DR-004` `TEST_READY`는 build 성공 handoff 상태이며 active build 판정에 포함되지 않아야 한다.

## 9. 정책 요구사항

- `PR-001` MVP preview URL은 우선 `host + port` 방식으로 제공할 수 있어야 한다.
- `PR-002` preview URL 데이터 모델은 미래 URL 전략 변경에 중립적이어야 한다.
- `PR-003` 기본 preview TTL은 권장값 `24시간`을 기준선으로 둔다.
- `PR-004` 동일 앱의 새 preview가 준비되면 이전 preview는 교체 대상으로 취급해야 한다.
- `PR-005` 사용자 입력 이름과 시스템 정규화 이름은 구분되어야 한다.

## 10. 제약 조건

- 현재 저장소는 구현 전 문서 중심 단계다.
- Git 저장소 초기화와 원격 저장소 연결은 완료되었지만, 애플리케이션 코드와 실행 명령은 아직 준비되지 않았다.
- 실제 인증 시스템, object storage, registry, reverse proxy는 아직 확정되지 않았다.
- 보안/격리 정책은 문서 선행 합의가 필요하다.

## 11. 미결정 항목

- `userId`의 실제 source system
- preview host 구조와 인증 방식
- TTL 연장 요청 처리 주체
- preview cleanup ownership
- Dockerfile 생성 정책의 상세 우선순위
- 실패 요약 생성 책임의 분담
- branch 또는 환경 단위 앱 분기 모델 필요 여부

## 12. 다음 단계

이 문서 다음 SDLC 단계에서 수행할 작업:

1. 요구사항 리뷰 및 우선순위 조정
2. 요구사항을 기반으로 도메인/상태/정책 설계 문서 작성
3. API 계약 초안 및 데이터 모델 초안 작성

## 13. 현 단계 결론

- 현재 컨셉은 요구사항 문서로 변환 가능한 수준까지 구체화되었다.
- MVP의 핵심 요구사항은 "빌드 성공"이 아니라 "preview URL 제공과 이해 가능한 상태 안내"다.
- 구현 전에 남은 미결정 항목을 요구사항 수준에서 더 정제하면 이후 설계 품질이 안정된다.
