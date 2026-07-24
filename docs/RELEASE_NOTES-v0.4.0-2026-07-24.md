# Release Notes — v0.4.0 (2026-07-24)

- 문서 목적: `v0.4.0` (Phase 3 완료 — 호스팅 능력) 의 종합 리뷰 — 무엇이 생겼나, 운영 방법, 검증, 업그레이드 안내.
- 범위: `v0.3.0` 이후 TASK-166 ~ TASK-170 코드 델타
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-24
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [Phase 3 컨셉](./PHASE-3-CONCEPT.md), [Phase 3 설계](./PHASE-3-DESIGN.md), [호스팅 운영](./operations/hosting-2026-07-24.md), [Release Notes v0.3.0](./RELEASE_NOTES-2026-07-24.md)

## 1. 요약

`v0.4.0` 은 **Phase 3 (호스팅 능력) 을 종결**하는 minor release 다. 시스템이 이제 이미지를 만들어 배포하는 데서 그치지 않고, **서비스로 띄워 URL 로 접속·관리**한다.

- 코드 델타: TASK-166 ~ TASK-170 (P3-M1~M5)
- 5 package.json: `0.3.0` → **`0.4.0`**
- git tag: **`v0.4.0`**
- 회귀 baseline: build-server **186 → 198** / build-monitor **275 → 279** / migration **0001~0010** / **호스팅 e2e ALL PASS**

빌드된 이미지가 k8s 에 지속 호스팅되고 `http(s)://<HOSTING_BASE_HOST>/<context-path>/` 로 접근된다.

## 2. 새로 생긴 것

### 2.1 🟢 k8s 호스팅 (배포 = 호스팅)

빌드된 이미지가 Deployment + Service + **Ingress** 로 k8s 에 배포돼 path-prefix 로 라우팅된다. `POST /builds` 가 `contextPath`(URL prefix, 미지정 시 appName 정규화·전역 유일·예약어 회피) / `runtimePort`(기본 8080) / `stripPrefix`(기본 true) 를 받는다. 배포 성공 시 build-server 가 `HostedService` 를 upsert 하고 URL 을 조립한다(`HOSTING_BASE_HOST` 설정 시 활성 — opt-in). (P3-M1/M2)

### 2.2 🟢 호스팅 관리

`GET/POST/DELETE /admin/hosted-services` + UI `/admin/hosting`:
- 목록/상세, 중지(`scale 0`)/재개(`scale 1`), 제거(`delete deployment,service,ingress` + context-path 반환).
- 관리 kubectl 은 **build-server 가 직접 shell-out**(runner=배포 생성, build-server=수명 관리). (P3-M3)

### 2.3 🟢 sub-path 규약 (`APP_BASE_PATH`)

각 앱 컨테이너에 `APP_BASE_PATH=/<context-path>/` env 가 주입된다. 앱은 emit URL 에 이 prefix 를 붙이면 context-path 하위에서 자산까지 정상 로드된다.
- `stripPrefix=true`(기본): Ingress 가 prefix 를 strip, 앱 서버는 루트 기준.
- `stripPrefix=false`: pass-through(base-path-aware 서버, 예: Next `basePath`).
- **제약**: 절대경로 하드코딩 + `APP_BASE_PATH` 미지원 앱은 미지원. 예제 `examples/hosted-base-path-app`, 가이드 [sub-path](./operations/hosting-sub-path-2026-07-24.md). (P3-M4)

## 3. 검증

| 스위트 | 결과 |
|--------|------|
| build-monitor `vitest run` | **279 PASS** |
| build-server `node --test` | **198 PASS** (186 → 198) |
| runner `go test ./...` | **8 pkg PASS** |
| skill_mcp `pytest -s` | **225 PASS** |
| `tsc --noEmit` × 5 packages | **clean** |
| postgres migration | **0001~0010** |
| **호스팅 e2e (신규)** | **ALL PASS** — `apps/runner/scripts/e2e-hosting.sh`: kind + ingress-nginx 로 실 `host/<cp>/` 라우팅 + `APP_BASE_PATH` 자산 로드 + stop/remove 관리 (kind v0.24.0 + kubectl v1.31.4) |

**Phase 3 완료 판정**([PHASE-3-CONCEPT §9](./PHASE-3-CONCEPT.md)) 5항 전부 충족.

## 4. 업그레이드 안내

- **DB migration**: `0009`(hosted_service 테이블 + build_request context_path/runtime_port) + `0010`(build_request strip_prefix) **적용 필요**. `bash apps/build-server/scripts/db-migrate.sh --apply-all`.
- **API 계약**: 호환 확장(하위 호환) — BuildRequest 에 optional `contextPath`/`runtimePort`/`stripPrefix`. BuildSummary·DeploymentReportRequest 필드 추가, targetType `K8S` + errorCode `CONTEXT_PATH_TAKEN`. 신규 admin `/admin/hosted-services*`. 기존 소비자는 미지정 시 종전 동작.
- **신규 env(선택)**: `HOSTING_BASE_HOST`(설정해야 호스팅 upsert 활성) / `HOSTING_KUBE_CONTEXT` / `HOSTING_KUBECTL_BIN`(build-server 관리). **전제**: 클러스터에 ingress-nginx, runner/build-server 에 `kubectl` + kubeconfig.
- **Rollback**: `git checkout v0.3.0`. migration 0009/0010 은 데이터 컬럼/테이블 추가라 롤백 시 스키마 정합 주의(호스팅 미사용 환경은 영향 최소).

## 5. 운영자 검증 순서

1. `git fetch && git checkout v0.4.0` + 5 package version `0.4.0` 확인.
2. `pnpm install` → 5 pkg TS clean → build-server dist → migration `0001~0010` 적용.
3. `GET /health` / `POST /builds`(contextPath 포함) 202 / phase 진행 확인.
4. (선택) 호스팅 e2e: `bash apps/runner/scripts/e2e-hosting.sh`(kind + ingress-nginx 필요).
5. (선택) 관리: `/admin/hosting` UI 에서 목록/stop/start/delete.

## 6. follow-up

- **호스팅 e2e 의 nightly CI 편입**(현재 수동) — 다음 patch 후보.
- k8s adapter 확장(Helm/ArgoCD, per-build namespace 정리) / subdomain 스킴(sub-path 대안) / 호스팅 status 주기 sync+캐시 / `<base>` 주입 옵션. ([CHANGELOG §8·§9](../CHANGELOG.md))
