# Docker Build Preview Platform SDLC Step 03 - Requirements Baseline

- 문서 목적: 컨셉 문서를 SDLC 요구사항 기준선으로 변환한다.
- 범위: 문제 정의, 목표, 사용자 시나리오, 요구사항 분류 기준
- 대상 독자: 프로젝트 리드, 기획자, AI 에이전트, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/SRS/01-priority-matrix.md`, `docs/sdlc/SRS/02-functional-requirements.md`, `docs/sdlc/SRS/03-non-functional-requirements.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

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
- preview 서비스는 무제한으로 늘리지 않고 운영 상한 안에서 제어할 수 있어야 한다.
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
8. preview 실행 슬롯이 부족하면 시스템은 preview service queue에서 대기시킨다.
9. 시스템은 preview URL을 생성한다.
10. AI 에이전트는 사용자에게 preview URL과 상태를 안내한다.

### 5.2 중복 빌드 시나리오

1. 같은 `userId + appName`에 대해 이미 active build가 존재한다.
2. 신규 요청은 별도 build를 만들지 않는다.
3. 시스템은 기존 build 정보를 반환한다.
4. AI 에이전트는 기존 작업이 진행 중임을 사용자에게 설명한다.

### 5.3 preview 자원 대기 시나리오

1. build 자체는 성공했지만 동시에 실행 가능한 preview 서비스 수가 상한에 도달한다.
2. 시스템은 build queue를 붙잡지 않고 preview service queue에서 대기 상태를 기록한다.
3. 슬롯이 비면 preview 컨테이너를 실행한다.
4. AI 에이전트는 사용자에게 "빌드는 완료되었고 미리보기 실행을 기다리는 중"이라고 안내한다.

### 5.4 실패 시나리오

1. 이미지 빌드 또는 preview 실행 중 오류가 발생한다.
2. 시스템은 실패 상태와 관련 오류 정보를 기록한다.
3. AI 에이전트는 실패 원인을 사용자 친화적으로 요약한다.
4. 사용자는 다음 조치 방향을 안내받는다.

## 6. 요구사항 구조

상세 요구사항은 아래 문서로 분리한다.

- 우선순위 분류: `docs/sdlc/SRS/01-priority-matrix.md`
- 기능 요구사항: `docs/sdlc/SRS/02-functional-requirements.md`
- 비기능 요구사항: `docs/sdlc/SRS/03-non-functional-requirements.md`
- 정책/제약 요구사항: `docs/sdlc/SRS/04-policy-and-constraints.md`
- 미결정 항목/의사결정: `docs/sdlc/SRS/05-open-issues-and-decisions.md`
- MVP 필수 확정 범위: `docs/sdlc/SRS/06-mvp-must-requirements.md`

## 7. 현 단계 결론

- 현재 컨셉은 요구사항 문서로 변환 가능한 수준까지 구체화되었다.
- MVP의 핵심 요구사항은 "빌드 성공"이 아니라 "preview URL 제공과 이해 가능한 상태 안내"다.
- 다만 preview 제공은 build queue와 별도 preview service queue 관점으로 분리해 다뤄야 한다.
- 구현 전에 남은 미결정 항목을 요구사항 수준에서 더 정제하면 이후 설계 품질이 안정된다.
