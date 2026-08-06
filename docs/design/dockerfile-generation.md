# Dockerfile 자동 생성 정책

## 범위

`BuildRequest.dockerfileMode`는 `required`와 `auto`를 지원한다.

- `required`가 기본값이다. 지정한 Dockerfile이 없으면 `DOCKER_BUILD_FAILED`로 종료한다.
- `auto`는 Runner가 source archive를 압축 해제한 뒤 Dockerfile 부재를 확인할 때만 동작한다.
- 이미 Dockerfile이 있으면 두 모드 모두 사용자가 제공한 파일을 그대로 사용한다.

## v1 판정 규칙

- `index.html`이 있으면 정적 사이트로 판정하고 고정 버전 nginx 기반 파일을 생성한다.
- `package.json`에 `scripts.start`가 있으면 Node 앱으로 판정하고 고정 버전 node 기반 파일을 생성한다.
- 두 조건을 만족하지 않으면 자동 추측하지 않고 실패한다.

생성 파일은 source workspace에 기록하며 `.dib-dockerfile-generated.json` marker와
build manifest에 template 이름을 남긴다. 생성 여부는 Runner 로그에도 기록된다.

## 운영 제약

- `auto`는 신뢰할 수 있는 template이 등록된 유형에만 사용한다.
- base image 버전은 코드에 고정하고 임의 사용자 입력으로 치환하지 않는다.
- `required` 기본값으로 기존 빌드의 재현성과 호환성을 유지한다.

## 서비스 DB 정책

- Dockerfile 자동 생성 템플릿은 `DATABASE_URL`, `DB_*`, `PG*` 연결 환경변수를
  선언하지 않는다.
- 사용자가 제공한 Dockerfile도 같은 선언을 포함하면 거부한다. 서비스 DB는
  `ServiceManifest.database.enabled=true`와 migration command로만 opt-in한다.
- Build Server가 서비스별 schema/role을 만들고 Kubernetes Secret의
  `DATABASE_URL`을 컨테이너에 주입한다. host IP, schema, role, password는
  BuildRequest나 Dockerfile 입력으로 받지 않는다.
- 앱은 `DATABASE_URL`을 런타임에 읽고, Dockerfile에는 DB credential이나
  gateway 주소를 저장하지 않는다.
