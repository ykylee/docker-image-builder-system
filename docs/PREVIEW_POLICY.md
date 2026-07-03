# Legacy Preview Policy Note

- 이 파일명은 초기 preview-oriented 설계의 흔적이다.
- 현재 canonical 정책 기준은 아래 문서를 우선한다.
  - `docs/sdlc/SRS/04-policy-and-constraints.md`
  - `docs/sdlc/decisions/02-preview-host-structure.md`
  - `docs/sdlc/decisions/03-preview-auth-policy.md`
  - `docs/sdlc/design/05-build-and-preview-execution-flow.md`
- 현재 모델에서 preview URL 또는 임시 runtime URL은 테스트 결과를 노출하는 한 방식일 뿐이며, 제품 전체 목표는 build -> container test -> external deployment -> result delivery 폐루프를 닫는 것이다.
- 파일 rename 또는 archive 이동은 후속 정리 작업에서 수행할 수 있다.
