# Skill: dockerfile-template-suggest

- 목적: source 신호에 맞는 Dockerfile 템플릿을 추천하거나 자동 생성 정책을
  설명한다.
- 자동 생성 유형: `index.html` 기반 `static-nginx`, `package.json`의
  `scripts.start` 기반 `node`만 허용한다.
- 생성물은 8080을 기본 포트로 사용하고 path-hosted 정적 앱은 root-absolute
  자산을 사용하지 않는다.

## 서비스 DB 정책

- 서비스 DB는 Dockerfile에서 설정하지 않는다.
- `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_SCHEMA`, `DB_ROLE`,
  `DB_USER`, `DB_PASSWORD`, `PG*` 선언을 생성·추천·수용하지 않는다.
- DB 사용은 `ServiceManifest.database.enabled=true`와 migration command로
  opt-in한다.
- Build Server가 서비스별 schema/role을 생성하고 Kubernetes Secret의
  `DATABASE_URL`을 런타임에 주입한다. host IP, schema, role, password는
  요청 payload나 Dockerfile에 포함하지 않는다.

## 출력 원칙

추천 결과에는 template 이름, 근거, 8080/runtime 제약, DB 정책 위반 여부를
포함한다. DB 연결값이 입력되면 추천 결과가 아니라 정책 위반 오류로 반환한다.
