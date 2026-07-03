# SRS 01 - Requirements Priority Matrix

- 문서 목적: 요구사항을 우선순위별로 분류해 MVP 범위와 후속 범위를 구분한다.
- 범위: `Must`, `Should`, `Could`, `Open` 분류
- 대상 독자: 프로젝트 리드, 기획자, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-03
- 관련 문서: `docs/sdlc/SRS/06-mvp-must-requirements.md`

## 1. 분류 기준

- `Must`: MVP에 반드시 포함되어야 하며 빠지면 핵심 사용자 가치가 무너진다.
- `Should`: MVP 직후 또는 설계 단계에서 강하게 고려해야 한다.
- `Could`: 후속 확장으로 미뤄도 된다.
- `Open`: 방향은 필요하지만 아직 의사결정이 완료되지 않았다.

## 2. Must

- 자연어 배포 요청 인식
- 소스 루트 식별
- 앱 이름 확인 또는 제안
- `Dockerfile` 확인
- `.dockerignore` 확인 또는 생성
- Git URL 또는 Zip 입력 정규화
- Build Server의 요청 수신과 DB 저장
- `userId + appName` 기준 active build 중복 방지
- build 상태 조회 API
- build 로그 조회 API
- 단일 Runner 기반 순차 처리
- Docker 이미지 빌드
- 컨테이너 실행 및 최소 동작 테스트
- 외부 시스템 배포
- polling 기반 상태 조회 또는 동등한 결과 전달
- 사용자 친화 상태 메시지
- 실패 원인 요약 및 다음 조치 안내
- build 상태와 test/deploy 상태 분리

## 3. Should

- `Dockerfile` 자동 생성 정책
- 테스트 실행 TTL 정책
- 실행 환경 교체 정책
- health check / port open / stability window 기준
- 오류 코드 체계
- 시스템 이름 정규화 규칙
- 운영자 추적이 가능한 로그 수준
- notification 이벤트 모델

## 4. Could

- reverse proxy 기반 실행 결과 URL
- subdomain 기반 실행 결과 URL
- 추가 배포 프로토콜 지원
- 다중 Runner 확장
- branch 단위 앱 분기
- 테스트 실행 TTL 연장 기능

## 5. Open

- `userId`의 실제 source system
- 테스트 실행 host 구조
- 테스트 실행 인증 정책
- runtime cleanup ownership
- 입력 정규화 경계(Build Server 직접 수신 vs 전처리 계층 변환)
- deploy target protocol의 MVP baseline
- Dockerfile 생성 책임의 상세 분담
- 실패 요약 책임의 상세 분담

## 6. 현 단계 결론

- MVP의 `Must`는 "입력 수신 -> build -> container test -> external deploy -> 결과 안내"에 필요한 최소 폐루프로 정의한다.
- `Must` 항목의 설계 입력 기준선은 `docs/sdlc/SRS/06-mvp-must-requirements.md`로 고정한다.
- `Should`와 `Open`은 구현 전 baseline decision으로 더 줄이는 것이 바람직하다.
