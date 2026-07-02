# Docker Build Preview Platform Identity Model

- 문서 목적: 사용자, 앱, 빌드, preview를 식별하는 핵심 키와 naming 규칙을 정의한다.
- 범위: `userId`, `appName`, `buildId`, active build 기준, naming policy
- 대상 독자: 프로젝트 리드, AI 에이전트, API/도메인 설계자
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/CONCEPT_REFINEMENT.md`, `docs/MVP_ONBOARDING.md`, `docs/PREVIEW_POLICY.md`

## 1. 정책 목표

식별자 모델은 다음 조건을 만족해야 한다.

- 사용자와 AI 에이전트가 같은 대상을 일관되게 가리킬 수 있어야 한다.
- Build Server가 중복 빌드를 안정적으로 판정할 수 있어야 한다.
- preview URL, 로그, 상태 조회가 모두 같은 기준 키를 사용할 수 있어야 한다.

## 2. 핵심 식별자

### 2.1 `userId`

`userId`는 빌드 요청의 소유 주체를 식별하는 플랫폼 수준 식별자다.

MVP 기준 정의:

- 사람이 읽을 수 있는 계정/사용자 식별자
- 외부 인증 시스템과의 매핑 가능성을 열어둠
- Build Server 내부에서는 문자열 키로 취급

현재 단계 결론:

- `userId`는 "누가 이 앱 preview를 소유하고 있는가"를 나타내는 상위 파티션 키다.
- 빌드 중복 판정, preview 교체 정책, 향후 사용량 추적의 기본 축이다.

### 2.2 `appName`

`appName`은 사용자가 테스트하려는 애플리케이션 단위를 나타낸다.

원칙:

- 사용자 관점에서 기억 가능한 이름이어야 한다.
- 한 `userId` 안에서 비교적 안정적으로 유지되어야 한다.
- 파일 경로나 저장소 이름과 완전히 같을 필요는 없다.

MVP 권장:

- AI 에이전트가 기본 이름을 제안할 수 있다.
- 사용자가 필요하면 수정할 수 있다.
- 서버에는 정규화된 값만 전달한다.

정규화 예시:

```text
Todo App -> todo-app
My Preview Service -> my-preview-service
```

### 2.3 `buildId`

`buildId`는 개별 빌드 요청의 고유 식별자다.

원칙:

- 전역적으로 유일해야 한다.
- 상태 조회, 로그 조회, preview 연결의 기본 참조 키가 된다.
- 사람이 복사/전달하기 쉬운 형식이 바람직하다.

예시 형식:

```text
bld-20260702-000124
```

### 2.4 `previewId`

MVP에서는 preview를 별도 외부 식별자로 먼저 노출하지 않아도 된다.

대신 다음 조합으로 충분하다.

- `buildId`
- `userId`
- `appName`

필요하면 이후 `previewId`를 추가할 수 있지만, 초기에는 `buildId`가 preview 대표 키 역할도 함께 수행한다.

## 3. active build 판정 규칙

### 3.1 판정 기준

동일 `userId + appName` 조합에 대해 active build는 하나만 허용한다.

이 규칙의 목적:

- 중복 빌드 낭비 방지
- 어떤 preview가 최신 결과인지 혼동 방지
- Runner 큐 단순화

### 3.2 active 상태

다음 상태는 active build로 본다.

```text
QUEUED
PREPARING
VALIDATING
BUILDING
IMAGE_BUILT
TEST_DEPLOYING
TEST_READY
PUSHING
REGISTERING
```

### 3.3 terminal 상태

다음 상태는 active build가 아니다.

```text
COMPLETED
FAILED
CANCELLED
```

### 3.4 `TEST_READY`를 active로 유지하는 이유

`TEST_READY`를 active 상태에 포함하는 이유는 preview가 아직 "현재 사용자가 테스트 중인 최신 실행 결과"이기 때문이다.

즉, 빌드 파이프라인 실행은 끝나가더라도 사용자 경험 관점에서는 아직 같은 작업 맥락이 유지된다.

## 4. naming policy

### 4.1 사용자 입력 이름과 시스템 이름 분리

문서에서는 두 층을 구분한다.

- display name: 사용자에게 보여주는 이름
- system name: 서버와 URL에서 쓰는 정규화 이름

예시:

```text
display name = "Todo App"
system name = "todo-app"
```

### 4.2 system name 규칙

권장 규칙:

- 소문자 사용
- 공백은 `-`로 치환
- 영문, 숫자, `-` 중심 사용
- 길이 제한은 이후 API 계약에서 확정

### 4.3 충돌 처리 원칙

동일 `userId` 내에서 같은 `appName`은 같은 앱의 연속 빌드로 간주한다.

이름 충돌을 새 앱으로 분기하지 않는 이유:

- 사용자에게 같은 이름은 같은 앱이라는 정신 모델을 제공
- 중복 빌드 정책과 preview 교체 정책을 단순화

## 5. 아직 남은 질문

- `userId`가 실제 인증 시스템 사용자 키와 1:1인지
- 팀/조직 단위 네임스페이스가 필요한지
- `appName` 변경 이력을 보존할지
- 같은 앱의 branch 개념을 나중에 도입할지

## 6. 현 단계 결론

- MVP 식별자 모델의 중심은 `userId + appName + buildId`다.
- 중복 빌드 판정과 preview 교체 정책은 `userId + appName`에 기반한다.
- preview 외부 식별자는 일단 `buildId`로 충분하며, 필요 시 이후 확장한다.
