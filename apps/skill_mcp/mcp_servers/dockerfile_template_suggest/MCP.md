# MCP: dockerfile-template-suggest

Dockerfile 템플릿 추천 결과를 반환하는 MCP 후보다. 현재 `transport_ready=false`
이므로 `apps/runner/internal/dockerfile`의 실제 생성 정책과 skill 문서를
기준으로 수동/후속 stdio 연동을 수행한다.

## 서비스 DB 정책

입력과 출력 모두 다음 값을 포함하지 않는다.

- host IP 또는 DB gateway 주소
- schema/role/user/password
- `DATABASE_URL`, `DB_*`, `PG*` 환경변수 선언

서비스 DB가 필요하면 `ServiceManifest.database.enabled=true`와 migration
command만 안내한다. Build Server가 schema/role과 Secret을 발급하고 런타임에
`DATABASE_URL`을 주입한다. 정책 위반 입력은 `SERVICE_DATABASE_POLICY_VIOLATION`
오류로 반환한다.
