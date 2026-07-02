# SRS 02 - Functional Requirements

- 문서 목적: 기능 요구사항을 범주별로 상세 도출한다.
- 범위: 사용자 요청, Build Server, Runner, 상태 안내 기능
- 대상 독자: 기획자, 설계자, 구현 담당자
- 상태: draft
- 최종 수정일: 2026-07-02

## 1. 사용자 요청 및 입력 준비

- `FR-001` 시스템은 사용자의 자연어 배포 요청을 인식할 수 있어야 한다.
  - 입력 예: "배포해줘"
  - 기대 결과: 배포 준비 플로우 시작

- `FR-002` 시스템은 현재 개발 산출물의 소스 루트를 식별할 수 있어야 한다.
  - 목적: 패키징 대상 경로 확정

- `FR-003` 시스템은 앱 이름을 확인하거나 제안할 수 있어야 한다.
  - 목적: `userId + appName` 기준 중복 판정 및 preview 식별

- `FR-004` 시스템은 `Dockerfile` 존재 여부를 확인할 수 있어야 한다.

- `FR-005` 시스템은 `Dockerfile`이 없을 경우 생성 정책에 따라 준비할 수 있어야 한다.
  - 상세 생성 규칙은 후속 정책 문서에서 확정

- `FR-006` 시스템은 `.dockerignore`를 확인하거나 생성할 수 있어야 한다.

- `FR-007` 시스템은 빌드에 필요한 소스와 metadata를 압축 또는 패키징할 수 있어야 한다.

## 2. Build Server 기능

- `FR-008` Build Server는 빌드 요청을 수신할 수 있어야 한다.

- `FR-009` Build Server는 빌드 요청을 DB에 저장할 수 있어야 한다.

- `FR-010` Build Server는 동일 `userId + appName` 기준 active build 존재 여부를 판정할 수 있어야 한다.

- `FR-011` active build가 있으면 신규 build를 생성하지 않고 기존 작업 정보를 반환해야 한다.
  - 반환 정보: `buildId`, 상태, 상태 조회 경로

- `FR-012` active build가 없으면 신규 build를 `QUEUED` 상태로 등록해야 한다.

- `FR-013` Build Server는 build 상태를 조회할 수 있는 API를 제공해야 한다.

- `FR-014` Build Server는 build 로그를 조회할 수 있는 API를 제공해야 한다.

- `FR-015` Build Server는 preview URL과 preview 상태 정보를 반환할 수 있어야 한다.

## 3. Runner 기능

- `FR-016` Runner는 `QUEUED` 상태의 작업을 순차적으로 가져올 수 있어야 한다.

- `FR-017` Runner는 작업 선점 시 상태를 적절히 전이시킬 수 있어야 한다.

- `FR-018` Runner는 소스 압축 해제와 작업 디렉터리 준비를 수행할 수 있어야 한다.

- `FR-019` Runner는 Docker 이미지 빌드를 수행할 수 있어야 한다.

- `FR-020` Runner는 빌드 로그를 저장할 수 있어야 한다.

- `FR-021` Runner는 빌드 성공 후 preview 컨테이너를 실행할 수 있어야 한다.

- `FR-022` Runner는 preview URL 생성에 필요한 host/port 정보를 기록할 수 있어야 한다.

- `FR-023` Runner는 preview readiness를 확인할 수 있어야 한다.

- `FR-024` Runner는 실패 시 오류 코드/메시지와 실패 단계를 기록할 수 있어야 한다.

- `FR-028` 시스템은 preview 실행 슬롯이 부족할 때 preview 시작 요청을 별도 service queue에 대기시킬 수 있어야 한다.

- `FR-029` 시스템은 preview service queue에서 대기 중인 요청을 슬롯이 비는 순서에 맞춰 실행할 수 있어야 한다.

## 4. 사용자 상태 안내 기능

- `FR-025` 시스템은 build 상태를 사용자 친화적 메시지로 번역할 수 있어야 한다.

- `FR-026` 시스템은 `TEST_READY` 또는 동등 상태에서 preview URL을 사용자에게 안내할 수 있어야 한다.

- `FR-027` 시스템은 실패 시 사용자에게 원인 요약과 다음 조치를 함께 안내할 수 있어야 한다.

## 5. 기능 요구사항 메모

- `FR-005`, `FR-023`, `FR-027`은 후속 정책 문서와 설계 문서에서 더 세분화가 필요하다.
- `FR-028`, `FR-029`는 preview 동시 실행 상한 정책과 함께 닫혀야 한다.
- 기능 요구사항의 구현 순서는 우선순위 매트릭스와 함께 판단한다.
