# SDLC Review

- 문서 목적: 요구사항부터 설계까지 작성된 문서 묶음의 정합성, 리스크, 후속 조치 필요사항을 리뷰 관점으로 정리한다.
- 범위: `docs/sdlc/`, 루트 개념 문서, workflow 메타 문서
- 대상 독자: 프로젝트 리드, 과제 수행자, 보고 검토자
- 상태: draft
- 최종 수정일: 2026-07-03

## Findings

이번 리뷰에서 확인한 보완 포인트는 문서 정합성 보정 대상으로 즉시 반영한다. 아래 finding은 검토 시점에 확인된 항목을 기록한 것이다.

### P1. 상태 모델의 canonical source가 이중화되어 있었다

- `docs/GLOSSARY_AND_STATE_MODEL.md`는 `TEST_READY`를 active build에 포함한다고 정의하고 있었다.
- `docs/GLOSSARY_AND_STATE_MODEL.md`는 preview 상태 목록에서 `QUEUED`를 누락하고 있었다.
- `docs/IDENTITY_MODEL.md`도 `TEST_READY`를 active 상태에 포함하고 있었다.
- 반면 `docs/sdlc/SRS/04-policy-and-constraints.md`와 `docs/sdlc/contracts/01-shared-build-contract-baseline.md`는 `TEST_READY`를 handoff 상태로 두고 active build로 유지하지 않으며, preview 상태에 `QUEUED`를 포함하고 있었다.

영향:

- 요구사항-설계 기준선과 초기 개념 문서가 서로 다른 상태 모델을 설명하게 된다.
- 후속 구현자가 루트 개념 문서를 먼저 읽으면 active build 판정과 preview queue 처리 로직을 잘못 해석할 위험이 있다.

권고:

- 루트 개념 문서를 SDLC canonical model에 맞춰 정렬하거나, legacy 문서임을 명시해 source-of-truth를 하나로 줄여야 한다.

### P1. 제약 조건 문서에 현재와 다른 사실이 남아 있었다

- `docs/sdlc/SRS/04-policy-and-constraints.md`는 Git 저장소 초기화가 아직 안 되었다고 적고 있었다.
- 실제 저장소는 이미 Git 초기화와 원격 푸시가 완료된 상태다.

영향:

- 과제 계획, 일정 산정, 보고자료에서 저장소 준비도가 실제보다 낮게 보일 수 있다.
- 검토자에게 “문서 기준선의 최신성”에 대한 불신을 줄 수 있다.

권고:

- 현재 제약 조건은 “코드 미구현”, “실행 명령 미확정”, “인프라 미결정” 중심으로 다시 써야 한다.

### P2. 운영 메타 문서가 pre-SDLC 문서명을 혼용하고 있었다

- `ai-workflow/memory/active/repository_assessment.md`는 `docs/MVP_ONBOARDING.md`를 기준 문서처럼 가리키고 있었다.
- `ai-workflow/memory/active/repository_assessment.md`의 “즉시 필요한 다음 단계”는 이미 끝난 작업(`공통 도메인 계약 초안`, `기술 스택 결정`)을 아직 남은 일처럼 적고 있었다.
- `docs/PROJECT_PROFILE.md`도 문서 검증 기준에 `MVP_ONBOARDING`, `CONCEPT_REFINEMENT` 같은 legacy 이름을 그대로 사용하고 있었다.

영향:

- 보고용 자료 작성 시 어떤 문서를 최신 기준으로 볼지 혼선이 생긴다.
- 세션 복원 문서와 실제 SDLC 기준선 사이에 불필요한 컨텍스트 비용이 생긴다.

권고:

- workflow 메타 레이어도 `docs/sdlc/` 중심 구조로 정리하고, legacy 루트 문서는 참고 자료인지 기준 문서인지 역할을 다시 구분해야 한다.

## Good

- `docs/sdlc/SRS/06-mvp-must-requirements.md`까지 내려가며 요구사항 우선순위와 MVP scope가 선명해졌다.
- Step 05 decision, Step 06~12 breakdown 문서로 인해 Build Server P0 범위가 실제 구현 태스크 수준까지 잘 분해되었다.
- `docs/sdlc/contracts/01-shared-build-contract-baseline.md`를 중심으로 request/status/error contract가 고정된 점은 이후 스캐폴드 안정성에 도움이 된다.

## Review Conclusion

- 전체적으로 요구사항부터 설계까지의 흐름은 충분히 성숙했고, Build Server P0 구현에 들어갈 수 있을 정도로 문서 분해가 잘 되어 있다.
- 다만 검토와 보고 관점에서는 “legacy 개념 문서와 SDLC canonical 문서의 충돌”, “stale 제약 조건”, “workflow 메타 최신성 부족”이 먼저 정리되어야 문서 신뢰도가 올라간다.
- 따라서 과제 계획안의 첫 단계는 신규 기능 구현이 아니라 문서 정합성 정리와 source-of-truth 단일화로 두는 것이 적절하다.

## Follow-up Note

- 본 리뷰 결과에 따라 `docs/GLOSSARY_AND_STATE_MODEL.md`, `docs/IDENTITY_MODEL.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`, `ai-workflow/memory/active/repository_assessment.md`, `docs/PROJECT_PROFILE.md` 보정을 우선 진행한다.
- 보정 이후 canonical source는 `docs/sdlc/`와 `docs/sdlc/contracts/01-shared-build-contract-baseline.md`로 다시 명시한다.
