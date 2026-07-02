# SRS 05 - Open Issues And Decisions

- 문서 목적: 요구사항 단계에서 아직 닫히지 않은 쟁점과 후속 의사결정 항목을 정리한다.
- 범위: 미결정 항목, 의사결정 필요성, 설계 영향
- 대상 독자: 프로젝트 리드, 기획자, 설계 참여자
- 상태: draft
- 최종 수정일: 2026-07-02

## 1. 식별자 관련 쟁점

- `OI-001` `userId`의 실제 source system은 무엇인가
- `OI-002` 팀/조직 단위 namespace가 필요한가
- `OI-003` branch 또는 환경 단위 앱 분기 모델이 필요한가

## 2. preview 운영 쟁점

- `OI-004` preview host 구조는 단일 서버인가
- `OI-005` preview 인증 정책이 필요한가
- `OI-006` TTL 연장 요청은 누가 처리하는가
- `OI-007` preview cleanup ownership은 어떤 프로세스가 갖는가
- `OI-010` preview 동시 실행 상한과 service queue 정책은 어떻게 둘 것인가

## 3. 빌드 정책 쟁점

- `OI-008` Dockerfile 생성 정책의 상세 우선순위는 어떻게 되는가
- `OI-009` 실패 요약 생성 책임은 서버와 Skill/MCP 중 어디에 더 무게를 둘 것인가

## 4. 의사결정 우선순위

### High

- `OI-001`
- `OI-004`
- `OI-005`
- `OI-007`
- `OI-010`

### Medium

- `OI-006`
- `OI-008`
- `OI-009`

### Low

- `OI-002`
- `OI-003`

## 5. 현 단계 결론

- 현재 요구사항 단계에서 가장 먼저 줄여야 할 불확실성은 preview 운영 모델, service queue 정책, 식별자 source system이다.
- 이 문서의 항목들은 다음 설계 단계의 pre-checklist로 사용한다.
