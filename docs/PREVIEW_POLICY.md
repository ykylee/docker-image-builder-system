# Docker Build Preview Platform Preview Policy

- 문서 목적: preview URL 제공 방식과 preview 수명 정책을 MVP 기준으로 정의한다.
- 범위: URL 노출 방식, lifecycle, 사용자 경험, 운영 제약
- 대상 독자: 프로젝트 리드, AI 에이전트, Build Server/Runner 설계자
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/CONCEPT_REFINEMENT.md`, `docs/MVP_ONBOARDING.md`

## 1. 정책 목표

preview 정책의 목표는 다음 두 가지를 동시에 만족하는 것이다.

- 비개발자 사용자가 바로 이해할 수 있는 테스트 접근 경험 제공
- 운영자가 통제 가능한 범위 안에서 preview 컨테이너를 수명 관리

MVP에서는 "간단하지만 추적 가능한 방식"을 우선한다.

## 2. MVP 기본 방침

### 2.1 URL 제공 목표

- 빌드가 성공하면 사용자는 테스트 가능한 단일 URL을 받는다.
- 사용자는 내부 포트, container id, Docker 명령을 알 필요가 없다.
- URL은 build 상태 조회 응답과 Skill/MCP 사용자 안내 문구에 모두 포함될 수 있어야 한다.

### 2.2 1차 노출 방식

MVP 1차안은 `host + port` 기반 노출을 기본값으로 둔다.

예시:

```text
http://preview-host.example.com:38124
```

이 방식을 우선 채택하는 이유:

- reverse proxy 없이도 빠르게 검증 가능
- Runner와 Build Server 책임 경계를 단순하게 유지 가능
- preview lifecycle과 포트 관리 정책을 먼저 검증할 수 있음

### 2.3 향후 확장 방향

MVP 이후 확장 후보:

- path 기반 URL
- subdomain 기반 URL
- 인증이 포함된 private preview URL

예시:

```text
https://preview.example.com/u/{userId}/apps/{appName}/builds/{buildId}
https://{appName}-{userId}.preview.example.com
```

다만 MVP 문서와 상태 모델은 `preview_url`을 일반 문자열로 다뤄, 미래 URL 전략이 바뀌어도 API 계약이 크게 흔들리지 않게 한다.

## 3. preview lifecycle 정책

### 3.1 기본 lifecycle

preview는 다음 순서를 따른다.

```text
RESERVED -> STARTING -> READY -> STOPPED
```

예외 상태:

```text
FAILED
EXPIRED
```

### 3.2 TTL 기본값

MVP 기본 TTL은 `24시간`을 권장 기본값으로 둔다.

이유:

- 비개발자 사용자가 테스트를 이어갈 시간적 여유 제공
- 당일 단위 운영 정리에 유리
- 너무 짧은 TTL로 인한 재배포 반복을 줄일 수 있음

추후 운영 데이터가 쌓이면 `1시간`, `6시간`, `24시간` 중 재조정할 수 있다.

### 3.3 동일 앱의 새 preview 처리

동일 `userId + appName` 조합에서 새 빌드가 `TEST_READY`에 도달하면, 이전 preview는 기본적으로 교체 대상으로 본다.

기본 원칙:

- 새 preview가 `READY`가 되기 전까지 기존 preview를 유지할 수 있다.
- 새 preview가 `READY`가 되면 이전 preview는 `STOPPED` 또는 `EXPIRED` 처리 후보가 된다.
- 사용자에게는 "가장 최신 preview가 기본 진입점"이라는 경험을 제공한다.

이 정책은 사용자가 여러 build 중 무엇이 현재 테스트 대상인지 혼동하지 않게 돕는다.

## 4. 사용자 경험 정책

### 4.1 사용자에게 보여줄 메시지 원칙

- 내부 구현 상태보다 "지금 무엇을 할 수 있는지"를 먼저 알려준다.
- URL이 준비되지 않았으면 예상 대기 상태를 설명한다.
- URL이 준비되면 만료 예정 시각도 함께 알려준다.

예시:

```text
테스트용 서비스가 준비되었습니다.
이 URL에서 결과를 확인할 수 있습니다.
이 preview는 2026-07-03 15:00 KST까지 유지됩니다.
```

### 4.2 사용자에게 숨길 내부 정보

- container id
- host port 선택 로직
- docker run 명령 전체
- 내부 health check 재시도 세부값

이 정보는 운영/디버그용으로 남기되 사용자 기본 응답에는 포함하지 않는다.

## 5. 운영 제약과 후속 질문

MVP에서 아직 확정이 더 필요한 항목:

- preview host는 단일 서버인지
- preview 트래픽 인증이 필요한지
- TTL 연장 요청을 Skill/MCP가 처리할지
- preview stop/cleanup 주기를 어떤 프로세스가 책임질지

## 6. 현 단계 결론

- MVP는 `host + port` 방식으로 빠르게 시작하고, API 모델은 URL 전략에 중립적으로 설계한다.
- preview는 "최신 테스트 결과를 보여주는 임시 환경"으로 정의한다.
- 같은 앱의 최신 preview를 기본 진입점으로 두는 정책이 사용자 경험상 가장 단순하다.
