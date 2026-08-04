# Release Notes — v0.9.0 (2026-08-04)

- 문서 목적: Helm/ArgoCD adapter와 배포 e2e를 포함한 v0.9.0 minor 릴리스 기록.
- 범위: Phase 3 v0.9.0 첫 마일스톤 — chart 기반 배포와 GitOps Application 배포.
- 상태: released
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [k8s 배포 운영](./operations/k8s-deploy-webhook-2026-07-24.md), [release checklist](./operations/release-checklist-2026-07-20.md)

## 1. 요약

v0.9.0은 v0.8.16 이후 첫 minor 릴리스다. 기존 `k8s` adapter를 유지하면서 `helm`과 `argocd` 배포 모드를 추가하고, kind 기반 실 배포 검증을 확장했다.

## 2. 주요 변경

- Helm adapter
  - release 이름을 명시적으로 유지해 Deploy/Cleanup 식별자 불일치 방지.
  - hosted chart Ingress와 `hosting.scheme`/`hosting.baseHost` values 전달.
  - Helm install/status/uninstall kind e2e 추가.
- ArgoCD adapter
  - Git source 기반 `Application` 생성.
  - Helm parameters로 image/build/hosting values 전달.
  - `Synced`/`Healthy` 상태 대기와 foreground cascade cleanup.
  - `RUNNER_K8S_MODE=argocd` worker wiring 및 `RUNNER_ARGOCD_*` 설정.
  - 테스트 전용 local Git source를 사용하는 ArgoCD kind e2e 추가.
- 운영 UI
  - Docker build 및 hosted service deployment 입력/관리 UI 반영.

## 3. 검증

| 스위트 | 결과 |
|---|---|
| frontend Vitest | 26 files / 282 tests PASS |
| build-server | 205 tests PASS |
| runner | `go test ./...`, `go vet ./...` PASS |
| TypeScript | React typecheck PASS |
| Helm e2e | kind install/status/uninstall ALL PASS |
| hosted HTTP e2e | path/subdomain/asset/stop/remove ALL PASS |
| ArgoCD e2e | Application Synced/Healthy + managed resources 생성/삭제 PASS |

## 4. 호환성과 업그레이드

- 기존 `RUNNER_K8S_MODE=k8s` 동작은 유지한다.
- Helm 사용 시 `RUNNER_HELM_*` 설정과 chart values contract를 준비한다.
- ArgoCD 사용 시 `RUNNER_ARGOCD_REPO_URL`과 `RUNNER_ARGOCD_PATH`가 필수다.
- DB schema, migration, 기존 API envelope 변경은 없다.
- 5개 package version을 `0.9.0`으로 통일한다. root `package.json`의 `0.1.0` anchor는 유지한다.

## 5. 롤백

릴리스 tag 기준으로 이전 안정 버전 `v0.8.16`을 checkout하고, 배포 mode를 기존 `k8s`로 되돌린다. 신규 Helm/ArgoCD 리소스는 각 adapter의 cleanup 절차로 제거한다.

## 6. 후속 작업

- Helm/hosted HTTP/ArgoCD 통합 deployment-e2e nightly CI 편입 완료.
- Linux runner의 ArgoCD local Git source 접근은 kind Docker network gateway를 사용한다.
- webhook 재시도/서명 및 외부 알림 채널 검토.
- v0.9.0 tag 기준 운영 배포 및 rollback 검증.
