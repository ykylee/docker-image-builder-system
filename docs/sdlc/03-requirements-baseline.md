# Docker Build And Deployment Automation Platform SDLC Step 03 - Requirements Baseline

- 문서 목적: 컨셉 문서를 SDLC 요구사항 기준선으로 변환한다.
- 범위: 문제 정의, 목표, 사용자 시나리오, 요구사항 분류 기준
- 대상 독자: 프로젝트 리드, 기획자, AI 에이전트, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/SRS/01-priority-matrix.md`, `docs/sdlc/SRS/02-functional-requirements.md`, `docs/sdlc/SRS/03-non-functional-requirements.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`, `docs/sdlc/SRS/05-open-issues-and-decisions.md`, `docs/sdlc/SRS/06-mvp-must-requirements.md`

## 1. 문서 목적과 사용 방식

이 문서는 컨셉 단계에서 정리한 방향을 SDLC의 "요구사항 도출 및 정제" 결과물로 변환한 기준선이다.

이 문서의 역할:

- 이후 설계 문서의 입력 기준
- 기능 범위 결정의 기준
- 정책 미결정 항목 추적의 기준
- 구현 착수 전 합의 문서

## 2. 문제 정의

외부 사용자 또는 AI 에이전트는 프로그램의 소스코드와 `Dockerfile`을 준비할 수 있어도, Docker 이미지 빌드, 컨테이너 실행 검증, 외부 시스템 배포를 안정적으로 자동화하기는 어렵다.

따라서 시스템은 사용자가 Docker 지식 없이도 다음 요청을 할 수 있도록 지원해야 한다.

```text
"배포해줘"
```

이 요청은 단순한 빌드 요청이 아니라, "소스를 받아 이미지로 만들고, 실제로 실행 가능한지 검증하고, 정상 결과물을 외부 시스템에 전달하고 싶다"는 사용자 목적을 포함한다.

## 3. 목표와 비목표

### 3.1 목표

- 사용자가 자연어로 배포 요청을 할 수 있어야 한다.
- AI 에이전트 또는 외부 사용자가 Git Repository URL 또는 Source Code Zip과 `Dockerfile`을 제공할 수 있어야 한다.
- Build Server가 빌드 요청을 추적 가능한 작업으로 저장할 수 있어야 한다.
- Build Worker 또는 Runner가 입력 소스를 준비하고 이미지를 빌드할 수 있어야 한다.
- 시스템이 컨테이너 실행 가능 여부와 최소 동작 테스트를 자동으로 수행할 수 있어야 한다.
- 테스트 성공 시 외부 시스템으로 결과물을 전달할 수 있어야 한다.
- 결과 전달 방식은 polling API 또는 이벤트 알림 중 하나 이상으로 닫혀야 한다.
- 테스트 또는 임시 runtime 실행 서비스는 운영 상한 안에서 제어할 수 있어야 한다.
- 사용자는 최종적으로 테스트 가능 상태, 배포 결과, 실패 원인을 추적 가능한 형태로 받아야 한다.
- 실패 시 사용자는 이해 가능한 실패 설명을 받아야 한다.

### 3.2 비목표

- 초기 단계에서 모든 배포 프로토콜(HTTP API, SCP, SFTP, Registry Push 등)을 동시에 지원하는 것
- 초기 단계에서 다중 Worker 병렬 처리 정책을 완전히 확정하는 것
- 초기 단계에서 reverse proxy 기반 preview URL을 필수화하는 것
- 초기 단계에서 완전한 멀티테넌트 보안 격리 모델을 확정하는 것

## 4. 이해관계자와 사용자

### 4.1 1차 사용자

- 외부 사용자 또는 비개발자 사용자
  - Docker build/run 세부 명령을 직접 알 필요는 없다.
  - Git URL 또는 Zip을 제공하고 배포 결과를 확인한다.
  - 최종적으로 테스트 상태, 배포 결과, 실패 원인을 확인한다.

### 4.2 시스템 행위자

- AI 에이전트 / Skill / MCP
- Build Server
- Build Worker / Runner
- 외부 배포 시스템
- 플랫폼 운영자

## 5. 사용자 시나리오

### 5.1 기본 성공 시나리오

1. 사용자가 AI 에이전트 또는 시스템에 "배포해줘"라고 요청한다.
2. AI 에이전트 또는 외부 사용자는 Git Repository URL 또는 Source Code Zip과 `Dockerfile`을 제공한다.
3. 시스템은 입력을 정규화하고 소스와 metadata를 Build Server에 전달한다.
4. Build Server는 요청을 저장하고 build 상태를 추적한다.
5. Worker는 Git clone 또는 Zip 해제를 수행해 작업 디렉터리를 준비한다.
6. Worker는 이미지를 빌드한다.
7. Worker는 컨테이너를 실행하고 최소 동작 테스트를 수행한다.
8. 테스트 성공 시 시스템은 외부 시스템으로 결과물을 전달한다.
9. 시스템은 polling API 또는 이벤트 알림으로 최종 결과를 전달한다.

### 5.2 중복 빌드 시나리오

1. 같은 `userId + appName`에 대해 이미 active build가 존재한다.
2. 신규 요청은 별도 build를 만들지 않는다.
3. 시스템은 기존 build 정보를 반환한다.
4. AI 에이전트는 기존 작업이 진행 중임을 사용자에게 설명한다.

### 5.3 테스트 성공 후 배포 시나리오

1. build 자체는 성공했다.
2. 시스템은 컨테이너 동작 테스트를 수행해 정상 실행 여부를 확인한다.
3. 테스트가 성공하면 외부 시스템 전송을 시작한다.
4. 사용자는 "빌드 성공", "테스트 성공", "배포 완료"를 분리된 상태로 확인할 수 있어야 한다.

### 5.4 실패 시나리오

1. 소스 준비, 이미지 빌드, 컨테이너 테스트, 또는 외부 배포 중 오류가 발생한다.
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
- MVP의 핵심 요구사항은 "입력 수신 -> 빌드 -> 컨테이너 테스트 -> 외부 시스템 전달 -> 결과 안내"의 폐루프를 닫는 것이다.
- preview URL은 여전히 유효한 운영 모델이지만, 이제는 "테스트 가능한 실행 결과"를 제공하는 여러 방식 중 하나로 다뤄야 한다.
- 구현 전에 입력 정규화 방식, 테스트 기준, 배포 프로토콜, 결과 전달 방식을 요구사항 수준에서 더 정제해야 이후 설계 품질이 안정된다.
