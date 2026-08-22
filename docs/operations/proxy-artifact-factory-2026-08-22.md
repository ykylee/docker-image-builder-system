# Proxy Artifact Factory 운영 런북

## 목적과 범위

이 문서는 로컬 fixture 기반 Artifact Factory를 사용해 Runner의 패키지 프록시,
인증, 무결성, prefetch 오류를 재현하고 배포 전 확인하는 절차를 정의한다.
실제 외부 upstream과 Keycloak 연결은 현재 로컬 환경의 검증 범위에 포함하지 않는다.

## 기본 smoke 순서

저장소 루트에서 다음 순서로 실행한다.

```bash
bash scripts/smoke-artifact-factory-ecosystems.sh
bash scripts/smoke-package-manager-fixtures.sh
bash scripts/smoke-package-manager-installs.sh
bash scripts/smoke-artifact-policy-matrix.sh
```

앞의 두 단계는 Python/npm/Go/Rust fixture의 endpoint와 메타데이터를 확인한다.
세 번째 단계는 실제 `pip`, `npm`, `go`, `cargo` 명령이 compose 네트워크에서
fixture 패키지를 설치하는지 확인한다. 정책 매트릭스는 cache hit/miss, upstream
차단, 손상 payload를 확인한다.

## Runner 오류 매트릭스

```bash
bash scripts/smoke-runner-artifact-failure-e2e.sh auth
bash scripts/smoke-runner-artifact-failure-e2e.sh integrity
bash scripts/smoke-runner-artifact-failure-e2e.sh prefetch
```

| 시나리오 | fixture fault | Build detail message | public code |
| --- | --- | --- | --- |
| `auth` | Runner가 잘못된 factory token 사용 | `FACTORY_AUTH_FAILED` | `UNKNOWN_ERROR` |
| `integrity` | malformed manifest 반환 | `ARTIFACT_INTEGRITY_FAILED` | `UNKNOWN_ERROR` |
| `prefetch` | `/v1/prefetch`가 HTTP 502 반환 | `PREFETCH_FAILED` | `UNKNOWN_ERROR` |

세 시나리오는 `.github/workflows/nightly-e2e.yml`의 `artifact-factory-e2e`
matrix job에서도 독립적으로 실행된다. 실패 시 해당 matrix case의 compose 로그와
Build detail의 `lastError.message`를 함께 확인한다.

## Compose fault 주입과 환경 변수

| 변수 | 용도 |
| --- | --- |
| `ARTIFACT_FACTORY_TOKEN` | fixture가 요구하는 factory bearer token |
| `RUNNER_AUTH_TOKEN` | Runner가 factory 요청에 보내는 token |
| `ARTIFACT_FACTORY_CORRUPT_MANIFEST=true` | cache miss 응답의 manifest digest를 손상 |
| `ARTIFACT_FACTORY_PREFETCH_FAIL=true` | prefetch endpoint를 502로 응답 |
| `DOCKER_SOCKET_GID=0` | Colima/CI에서 Docker socket group 차이를 피하기 위한 설정 |

정상 시나리오에서는 `ARTIFACT_FACTORY_TOKEN`과 `RUNNER_AUTH_TOKEN`을 동일하게
설정한다. `auth` 시나리오는 의도적으로 Runner token을 `wrong-token`으로 바꾼다.
스크립트가 종료될 때 compose service, container, volume을 정리하므로 중단 후에도
다음 실행에 영향을 주지 않아야 한다.

## 보안 및 운영 주의사항

- fixture의 anonymous package endpoint는 테스트 전용이다. 운영 Artifact Factory에는
  익명 접근을 활성화하지 않는다.
- 실제 credential을 저장소, workflow log, fixture 응답에 넣지 않는다. Runner 로그는
  token/password 값을 redaction한 결과만 남겨야 한다.
- offline fixture 검증에서만 `GOSUMDB=off`를 사용한다. 외부 Go module을 검증하는
  staging/production 경로에서는 조직 정책에 맞는 checksum database를 사용한다.
- Docker daemon mirror/proxy 설정과 실제 upstream 인증은 staging에서 별도로 검증한다.
  현재 smoke 결과만으로 외부 네트워크 가용성을 보장하지 않는다.

## 장애 대응 체크리스트

1. 실패한 matrix scenario와 Build ID를 기록한다.
2. `docker compose ... logs runner artifact-factory`로 오류 원인과 redaction 상태를 확인한다.
3. `lastError.message`의 상세 분류가 `FACTORY_AUTH_FAILED`,
   `ARTIFACT_INTEGRITY_FAILED`, `PREFETCH_FAILED` 중 하나인지 확인한다.
4. public API의 `code`가 호환성을 위해 `UNKNOWN_ERROR`로 유지되는지 확인한다.
5. 동일 fault를 재현한 뒤 fixture fault 환경 변수를 해제하고 기본 smoke 순서를 다시 실행한다.
