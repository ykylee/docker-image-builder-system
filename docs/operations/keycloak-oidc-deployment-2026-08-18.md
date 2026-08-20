# Keycloak OIDC 배포 주입 계약

현재 실행 환경에서는 외부 Keycloak에 연결할 수 없으므로, 이 문서는 실제
issuer 검증 대신 배포 시 주입해야 할 계약을 고정한다. 외부 연결 smoke test는
Keycloak realm과 네트워크가 준비된 환경에서 별도로 수행한다.

## Compose 선택 overlay

기본 `compose.dev.yaml`은 내부 self-dogfood 호환을 위해 `AUTH_MODE=disabled`를
사용한다. Keycloak을 사용하는 환경은 다음 선택 overlay를 함께 사용한다.

```sh
export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"
export ADMIN_IDS="<seed-admin-id>"
export OIDC_ISSUER_URL="https://<keycloak-host>/realms/<realm>"
export OIDC_CLIENT_ID="<confidential-client-id>"
export OIDC_CLIENT_SECRET="<secret-manager-value>"
export OIDC_REDIRECT_URI="https://<build-host>/auth/callback"
export OIDC_ADMIN_ROLE="admin"
export OIDC_ACCESS_TOKEN_AUDIENCE="<keycloak-access-token-audience>"

docker compose \
  -f compose.dev.yaml \
  -f compose.dev.oidc-keycloak.yaml \
  config
```

`config` 결과를 검토한 뒤에만 `up -d`를 실행한다. `OIDC_CLIENT_SECRET`은
파일·Git·이미지에 기록하지 말고 secret manager 또는 shell 환경에서 주입한다.

## Keycloak client 계약

- Issuer는 realm base URL이어야 한다. 예: `https://keycloak.example/realms/builders`
- Client는 confidential client로 만들고 authorization code flow와 PKCE(S256)를
  허용한다.
- Valid redirect URI는 `OIDC_REDIRECT_URI`와 완전히 일치해야 한다.
- ID token은 client ID를 audience로 검증하고, access token은 `OIDC_ACCESS_TOKEN_AUDIENCE`를
  audience로 검증한다. 별도 값을 주입하지 않으면 client ID를 fallback으로 사용한다.
- Web origin/CORS는 실제 Build Monitor origin만 허용한다.
- 역할은 ID token에 claim이 있으면 이를 우선 사용하고, 없으면 검증된 access token의
  `realm_access.roles`에서 읽는다. 다른 mapper를 사용하면 `OIDC_ROLE_CLAIM`을 dotted
  path로 바꾼다. 두 token의 `sub`가 다르면 callback을 거부한다.
- 관리자 역할은 `OIDC_ADMIN_ROLE`로 지정하며 기본값은 `admin`이다. Keycloak realm에서
  `dib-admin` 같은 다른 역할명을 사용하면 해당 값을 주입한다.
- Build Server는 `BUILD_REPOSITORY_BACKEND=postgres`와 Postgres-backed session
  store를 요구한다. OIDC mode에서 memory backend로 기동하지 않는다.

## 연결 가능 환경에서의 최소 확인

1. `GET /health`와 `GET /ready`가 200인지 확인한다.
2. 브라우저에서 `/auth/login` → Keycloak 로그인 → `/auth/callback` 왕복을 수행한다.
3. `GET /auth/session`이 `authenticated=true`를 반환하고 session cookie가
   `HttpOnly; Secure; SameSite=Lax`인지 확인한다.
4. 일반 사용자는 자신의 `/builds`만 조회하고, `realm_access.roles`에 `admin`이
   있는 사용자는 `/admin/builds`를 조회하는지 확인한다.
5. logout 후 session cookie가 폐기되고 `/auth/session`이 unauthenticated인지
   확인한다.

외부 Keycloak이 unavailable한 동안에는 저장소의 fake OIDC browser E2E와
Postgres E2E를 대체 회귀로 사용한다.

## Runner required-mode 대체 경로

Keycloak을 사용하지 않는 보호된 staging 검증은 `compose.dev.required-auth.yaml`을
사용한다. `AUTH_SECRET`과 외부 발급 `RUNNER_AUTH_TOKEN`을 모두 주입해야 하며,
Runner는 token이 없으면 시작하지 않는다.

Kubernetes에서는 `examples/k8s-control-plane-required-auth.yaml`과
`examples/k8s-runner-required-auth.yaml`을 함께 참고한다. Runner Secret에는
`AUTH_SECRET`으로 서명된 token만 저장하며, `AUTH_SECRET` 자체를 Runner에 주입하지
않는다. Runner manifest의 Docker socket mount는 현재 예시 호환을 위한 것이므로
untrusted build를 운영하기 전에 rootless worker와 최소 RBAC로 교체해야 한다.
