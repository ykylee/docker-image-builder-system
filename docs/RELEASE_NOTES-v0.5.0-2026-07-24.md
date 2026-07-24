# Release Notes — v0.5.0 (2026-07-24)

- 문서 목적: `v0.5.0` (subdomain 호스팅 스킴) 의 종합 리뷰.
- 범위: `v0.4.1` 이후 TASK-172 코드 델타
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-24
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [subdomain 설계](./design/subdomain-hosting.md), [sub-path 규약](./operations/hosting-sub-path-2026-07-24.md), [Release Notes v0.4.0](./RELEASE_NOTES-v0.4.0-2026-07-24.md)

## 1. 요약

호스팅에 **subdomain URL 스킴**을 더한 minor release. path-prefix(`host/<cp>/`)와 **병존**하며 빌드마다 선택한다.

- 코드 델타: TASK-172
- 5 package.json: `0.4.1` → **`0.5.0`**
- git tag: **`v0.5.0`**
- 회귀 baseline: build-server **198 → 199** / migration **0001~0011** / 호스팅 e2e(path + **subdomain**) ALL PASS

## 2. 무엇이 생겼나 — subdomain 스킴

`<context-path>.<HOSTING_BASE_HOST>/` 로 호스팅한다. 앱이 자기 subdomain 의 **루트**에서 서빙되므로 **절대경로 자산(`/main.js`)이 자연 동작 — 앱 무수정 지원**. path-prefix 가 요구하던 `APP_BASE_PATH` 규약·rewrite·stripPrefix 가 subdomain 에선 불필요하다.

**언제 쓰나**: 임의의 SPA/프레임워크를 **수정 없이** 완전 격리 호스팅하고 싶을 때. path-prefix 는 단일 host/무DNS 환경에, subdomain 은 앱 무수정 격리에 적합하다.

**동작**:
- `POST /builds` 의 `hostingScheme`: `"path"`(기본) | `"subdomain"`.
- subdomain 은 Ingress `host:` rule(`<cp>.<HOSTING_BASE_HOST>`)로 라우팅. runner 가 host rule 을 렌더하려면 base host 가 필요 → 신규 env `RUNNER_HOSTING_BASE_HOST`.
- `HostedService.url` 이 `https://<cp>.<host>/` 로 조립된다.

## 3. 검증

| 스위트 | 결과 |
|--------|------|
| build-monitor `vitest run` | **279 PASS** |
| build-server `node --test` | **199 PASS** (198 → 199) |
| runner `go test ./...` | **8 pkg PASS** |
| skill_mcp `pytest -s` | **225 PASS** |
| `tsc --noEmit` × 5 packages | **clean** |
| postgres migration | **0001~0011** |
| **호스팅 e2e** | **ALL PASS** — `e2e-hosting.sh`: path 라우팅 + **subdomain**(nip.io `demo2.127.0.0.1.nip.io` 실 host 라우팅 + 루트 자산 무수정 로드) + 관리(stop/remove) |

## 4. 업그레이드 안내

- **DB migration**: `0011`(build_request + hosted_service 에 `hosting_scheme`, default `'path'`) **적용 필요**.
- **API 계약**: 호환 확장 — BuildRequest·BuildSummary·HostedService 에 optional `hostingScheme`(기본 path). 미지정 시 종전 동작.
- **신규 env(선택)**: `RUNNER_HOSTING_BASE_HOST`(runner). **subdomain 사용 시 전제**: 클러스터 앞단에 **wildcard DNS**(`*.<host>`) — 운영. dev/e2e 는 **nip.io** magic DNS. **wildcard TLS**(cert-manager)는 **후속 release**.
- **Rollback**: `git checkout v0.4.1`. migration 0011 은 컬럼 추가라 롤백 시 스키마 정합 주의(호스팅 미사용 환경 영향 최소).

## 5. follow-up (v0.6.0 후보)

- **wildcard TLS**(cert-manager DNS-01) — subdomain HTTPS 자동화.
- k8s adapter 확장(Helm/ArgoCD, per-build namespace 정리) / 호스팅 status 캐시 / webhook 확장(Slack·재시도) / 실패 경로 e2e. ([CHANGELOG §10·§11](../CHANGELOG.md))
