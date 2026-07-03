# Legacy Identity Model Note

- 루트 식별자 모델 문서는 더 이상 canonical source가 아니다.
- 최신 식별자/중복 판정 기준은 아래 문서를 우선한다.
  - `docs/sdlc/contracts/01-shared-build-contract-baseline.md`
  - `docs/sdlc/design/02-domain-model-and-state-transitions.md`
  - `docs/sdlc/design/03-api-contract-design.md`
  - `docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md`
- 현재 핵심 식별자 축은 `userId`, `appName`, `buildId`이며, 상태 조회와 중복 빌드 판정은 canonical contract와 repository 설계를 기준으로 읽어야 한다.
- preview 외부 식별자 중심의 초기 설명은 최신 요구사항과 분리해 보관한다.
