<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# Project Workflow Profile

- 문서 목적: 프로젝트 특화 규칙과 실행/검증 기준을 정의한다.
- 범위: 프로젝트 개요, 문서 구조, 기본 명령, 검증 포인트, 예외 규칙
- 대상 독자: 개발자, 운영자, AI agent, 프로젝트 온보딩 담당자
- 상태: draft
- 최종 수정일: 2026-08-04
- 관련 문서: [공통 표준](../ai-workflow/core/global_workflow_standard.md)

## 1. 프로젝트 개요
- 프로젝트명: Docker Image Builder System
- 프로젝트 목적: 외부 사용자 또는 AI 에이전트가 전달한 앱 산출물을 빌드 서버가 받아 Docker build, 컨테이너 테스트, 외부 시스템 배포, 결과 전달까지 자동화하는 플랫폼을 설계한다.
- 주요 이해관계자: 비개발자 사용자, AI 에이전트 운영자, Build Server/Runner 설계자, 플랫폼 운영자

## 2. 문서 구조 (Path)
- 문서 위키 홈: README.md
- 운영 문서 홈: ai-workflow/memory/active/
- 운영 가이드 인덱스: docs/operations/ (v0.9.0 기준 누적 45종)
  - 현재 구현 현황/실사용 준비도: [`current-state-and-readiness-2026-08-05.md`](operations/current-state-and-readiness-2026-08-05.md) (기능 기준선, 검증 결과, 실서비스 차단 이슈)
  - 실서비스 진입 로드맵: [`production-readiness-roadmap-2026-08-05.md`](../.omx/plans/production-readiness-roadmap-2026-08-05.md) (인증·격리·복구·DB lifecycle·private beta 진입 게이트)
  - 호스팅 능력: [`hosting-2026-07-24.md`](operations/hosting-2026-07-24.md) (Phase 3 / P3-M1~M5 종합), [`hosting-sub-path-2026-07-24.md`](operations/hosting-sub-path-2026-07-24.md) (sub-path 규약 + stripPrefix)
  - 호스팅 3티어 정책 컨셉: [`hosting-tiers.md`](design/hosting-tiers.md) (서비스 규모·자원 할당 기반 `sandbox` / `standard` / `production` 분류 원칙)
  - 호스팅 3티어 정책 설계안: [`hosting-tiers-design.md`](design/hosting-tiers-design.md) (판정 resolver, policy snapshot, adapter 전달, migration/API 영향)
  - k8s adapter: [`k8s-deploy-webhook-2026-07-24.md`](operations/k8s-deploy-webhook-2026-07-24.md) (P2-M5 + TASK-175 k8s adapter 확장 §6.6 실측 절차)
  - Helm/ArgoCD adapter (v0.9.0): 위 k8s adapter 운영 가이드 §7/§8 및 [`e2e-helm-deploy.sh`](../apps/runner/scripts/e2e-helm-deploy.sh), [`e2e-argocd-deploy.sh`](../apps/runner/scripts/e2e-argocd-deploy.sh) (kind 실 e2e)
  - 운영 절차: [`release-checklist-2026-07-20.md`](operations/release-checklist-2026-07-20.md) (v0.8.3 k8s 보강 §1/§3/§4/§5/§7/§8 정합)
  - 호스팅 e2e CI: [`hosting-e2e-ci-2026-07-27.md`](operations/hosting-e2e-ci-2026-07-27.md) (v0.8.13 신규 — hosting-e2e 잡의 트리거 구조 / 7 step / e2e-hosting.sh 사이클 / 신호 강도 / env 8종 / 로컬 재현 + 트러블슈팅 5 case / 한계와 follow-up 3종)
- 설계 결정: docs/design/subdomain-hosting.md (v0.5.0)
- 백로그 위치: ai-workflow/memory/active/backlog/
- 세션 인계 문서: <ai-workflow/memory/active/session_handoff.md>
- 환경 기록 위치: <ai-workflow/memory/active/repository_assessment.md>
- 제품 온보딩 기준: docs/sdlc/01-mvp-onboarding.md
- 컨셉 고도화 문서: docs/sdlc/02-concept-refinement.md
- 요구사항 기준선: docs/sdlc/03-requirements-baseline.md
- 설계 구조 문서: docs/sdlc/04-design-structure.md
- Step 05 진입 문서: docs/sdlc/05-design-closure-and-step-05-entry.md
- Step 06 구현 축 문서: docs/sdlc/06-implementation-axis-and-workstreams.md
- Step 07 구현 backlog 문서: docs/sdlc/07-implementation-backlog-baseline.md
- Step 08 기술 스택 문서: docs/sdlc/08-build-server-tech-stack-baseline.md
- Step 09 저장소 구조 문서: docs/sdlc/09-repository-package-structure-baseline.md
- Step 10 `PKG-002` 세분화 문서: docs/sdlc/10-pkg-002-build-server-request-intake-breakdown.md
- Step 11 `PKG-003` 세분화 문서: docs/sdlc/11-pkg-003-build-server-persistence-breakdown.md
- Step 12 `PKG-004` 세분화 문서: docs/sdlc/12-pkg-004-build-server-query-api-breakdown.md
- Step 13 우리 시스템 skill/MCP 개발 계획: docs/sdlc/13-skills-and-mcp-plan.md
- Step 15 리팩토링 로드맵 및 마일스톤: docs/sdlc/15-refactoring-roadmap-and-milestones.md
- SDLC 리뷰 문서: docs/review/01-sdlc-review.md
- 과제 계획안: docs/report/01-assignment-plan.md
- 보고용 자료: docs/report/02-sdlc-review-report.html
- 공통 계약 기준 문서: docs/sdlc/contracts/01-shared-build-contract-baseline.md
- Step 05 baseline decisions: docs/sdlc/decisions/
- 설계 문서 1: docs/sdlc/design/01-system-context-and-responsibilities.md
- 설계 문서 2: docs/sdlc/design/02-domain-model-and-state-transitions.md
- 설계 문서 3: docs/sdlc/design/03-api-contract-design.md
- 설계 문서 4: docs/sdlc/design/04-data-model-design.md
- 설계 문서 5: docs/sdlc/design/05-build-and-preview-execution-flow.md
- 설계 문서 6: docs/sdlc/design/06-user-messaging-and-failure-handling.md

## 3. 기본 명령 (Commands)
- 설치: `pnpm install` (`esbuild` 계열 승인 정책 때문에 환경에 따라 `ERR_PNPM_IGNORED_BUILDS`가 날 수 있으며, 이 경우 watch/dev dependency 승인 또는 direct `tsc` 검증으로 우회)
- 로컬 실행 — memory backend (단일 runner / 단일 build / 빠른 smoke / CI / 디버깅용 보조 경로. Build Server API 만 — 단일 포트 mount 미사용): `./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json && ./node_modules/.bin/tsc -p packages/db/tsconfig.json && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js`
- 로컬 실행 — Postgres backend (**Postgres backend 가 default 개발 경로** — 운영 환경(production deployment) 은 Postgres 만 사용하므로 dev ↔ production 환경 drift 최소화. bytea round-trip 회귀 / FK CASCADE + migration / multi-runner 운영 검증 모두 Postgres 환경에서만 가능. 단일 포트 mount / React SPA fallback 미사용 시 Build Server API 만 — Postgres container 가 127.0.0.1:15432 에 떠 있어야 함. 자세한 운영 권장은 §3.2 Postgres default 개발 경로 + `docs/operations/source-archive-postgres-2026-07-18.md` 참조):
  ```bash
  ./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json && \
    ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json && \
    ./node_modules/.bin/tsc -p packages/db/tsconfig.json && \
    ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
    DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
    BUILD_REPOSITORY_BACKEND=postgres \
    DB_AUTO_BOOTSTRAP=true \
    node apps/build-server/dist/apps/build-server/src/index.js
  ```
- **단일 포트 reverse proxy (TASK-075)** — Build Server 가 build-monitor 의 React vite build 산출물 (`apps/build-monitor/dist-react/`) 을 정적 mount + SPA fallback 으로 함께 노출, `:3000` 한 포트로 backend + frontend 동시 접근:
  ```bash
  # 1) build-monitor 의 React vite build 산출물 생성 (workspace root 에서)
  ./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
    ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
    (cd apps/build-monitor && ./node_modules/.bin/vite build --config vite.react.config.ts) && \
    BUILD_REPOSITORY_BACKEND=memory \
    BUILD_MONITOR_REACT_DIST_PATH=apps/build-monitor/dist-react \
    node apps/build-server/dist/apps/build-server/src/index.js
  # 2) postgres backend 면 BUILD_REPOSITORY_BACKEND=postgres + DATABASE_URL + DB_AUTO_BOOTSTRAP=true 추가.
  ```
  그 다음 `curl http://127.0.0.1:3000/` (Build Monitor SPA), `curl http://127.0.0.1:3000/admin/builds` (SPA deep link fallback), `curl http://127.0.0.1:3000/api/builds` (Build Server API) 모두 동일 port 로 동작. Build Monitor 의 `react/src/lib/api.ts` 가 `baseUrl: "/api"` 로 fetch 하기 때문에 `/api/*` 가 Build Server 의 자체 route (`/builds`, `/admin/*`) 로 307 transparent redirect. dev 환경에서는 vite dev (`:5173`) 가 별도 port 에 떠서 `/api/*` 를 `:3000` 으로 프록시 (vite.config.ts) — 그 경로는 그대로 유지. e2e 검증: `bash apps/build-server/scripts/e2e-single-port.sh`.
- 빠른 테스트: `./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit && (cd apps/runner && go build ./...)`
- 격리 테스트: `curl http://127.0.0.1:3000/health && curl -X POST http://127.0.0.1:3000/builds ...` (memory / postgres backend smoke 모두 확인 완료)
- 실행 확인: `GET /health`(liveness), `GET /ready`(migration/repository bootstrap 완료 readiness), `POST /builds`, `GET /builds/:buildId`, `GET /builds/:buildId/logs` 응답과 `state.json`, `session_handoff.md`, `work_backlog.md`의 current focus 정합성 점검
- **Migration 운영 권장 (TASK-103)**: postgres migration 의 자주 쓰는 운영 시나리오 6종 — `--plan` (dry-run) / `--status` (applied / pending) / `--apply-all` (pending 일괄) / `--apply-up-to <ver>` (특정 version 까지만) / `--bootstrap` (greenfield) / `--dr-stop` (DR 절차 안내). 단일 entrypoint `scripts/db-migrate.sh` 권고 스크립트가 `apps/build-server/scripts/migrate.ts` 를 위임. 신규 staging verify / 운영 배포 전 dry-run / 운영 DB 일괄 적용 / 단계 적용 / DR + 복구의 5종 시나리오 모두 이 한 스크립트로 끝. 자세한 절차 + 사전 결함 + 보강 2건은 [`docs/operations/migration-cli-workflow-2026-07-20.md`](operations/migration-cli-workflow-2026-07-20.md) 참조.
- **운영 배포 체크리스트 (TASK-105)**: 신규 commit 의 운영 환경 배포 절차 8 섹션 (Pre-deploy / Deploy / Verify / Post-deploy Monitoring / DR-Rollback / Operational Safety / 운영 환경 baseline 갱신 / follow-up). 7 종 회귀 가드 (health / OpenAPI / React SPA + admin deep link + API / e2e-source-archive-postgres / e2e-multi-runner-postgres / e2e-production-semantic / e2e-single-port / scripts/db-migrate.sh --status) + workflow meta 동기성 점검 + 24 시간 post-deploy 모니터 + DR 절차 + 운영 안전장치 4 종 (workflow meta sync / 운영 가이드 cross-reference / destructive migration 안전 / 운영 환경 baseline drift). 본 운영 가이드는 운영자가 따르면서 release notes / CHANGELOG / git tag 같은 후속 TASK 의 필요성을 자연스럽게 발견. 자세한 절차는 [`docs/operations/release-checklist-2026-07-20.md`](operations/release-checklist-2026-07-20.md) 참조.
- **호스팅 능력 운영 종합 (v0.4.0, Phase 3 / TASK-166~170)**: build/deploy → managed hosting 축. k8s Ingress path-prefix 호스팅 + 관리 라이프사이클(stop/start/remove admin API) + sub-path 규약(APP_BASE_PATH + stripPrefix). 실 e2e(`apps/runner/scripts/e2e-hosting.sh`: kind+ingress-nginx path/subdomain/nip.io 실 host 라우팅 + 자산 로드 + stop/remove) ALL PASS. 운영 권고 + 아키텍처 결정 + follow-up + k8s staging 운영 가이드는 [`docs/operations/hosting-2026-07-24.md`](operations/hosting-2026-07-24.md) 참조. sub-path 규약(절대경로 하드코딩 앱 미지원 제약 + stripPrefix 2모드 + BuildRequest 필드)은 [`docs/operations/hosting-sub-path-2026-07-24.md`](operations/hosting-sub-path-2026-07-24.md).
- **호스팅 status 캐시 (v0.7.0 / TASK-174)**: `HostedService.status`(desired lifecycle)와 분리된 live replica read cache(`availableReplicas` + `lastSyncedAt`)를 주기 sync. `HOSTING_BASE_HOST` opt-in + `HOSTING_STATUS_SYNC_INTERVAL_MS`(기본 30s). UI `/admin/hosting` 에 Replicas 컬럼 + degraded 배지. 운영 권고는 [`docs/operations/hosting-2026-07-24.md` §6](./operations/hosting-2026-07-24.md) + release-checklist §4 Post-deploy #5.
- **k8s adapter 외부 배포 + webhook 결과 전달 (P2-M5 / TASK-165 + TASK-175 / v0.8.0)**: 제품 목적 4단계(build → container test → deploy → result delivery) 의 1급 phase + e2e. 외부 배포 adapter 1호 = k8s(`kubectlDeployer`, manifest apply+rollout status). 결과 전달 1호 = webhook(`RESULT_WEBHOOK_URL`, resultDelivery NOTIFICATION 파생). v0.8.0 k8s adapter 확장 3종(E1 per-build namespace / E2 Ingress cleanup / E3 k8s 실패 시 docker registry 결과 보존) + v0.8.1 k8s e2e nightly 편입. 운영 권고 + env + 실측 절차(§6.6) + 회귀 baseline 단락은 [`docs/operations/k8s-deploy-webhook-2026-07-24.md`](operations/k8s-deploy-webhook-2026-07-24.md) 참조. nightly CI 절차 = `bash apps/runner/scripts/e2e-k8s-deploy.sh` (`schedule(cron 04:00 UTC)` + `workflow_dispatch` 전용).
- **k8s e2e nightly (v0.8.1 / TASK-171 동형)**: `.github/workflows/nightly-e2e.yml` 의 `k8s-deploy-e2e` 잡이 `apps/runner/scripts/e2e-k8s-deploy.sh` 를 자동 실행 — busybox httpd 빌드 → kind load → `kubectlDeployer` 실배포(`availableReplicas=1`) + webhook 결과 전달(수신 stub) 검증. cluster `dib-e2e` (hosting-e2e 의 `dib-hosting-e2e` 와 분리되어 동시 실행 가능). release-checklist §1 Pre-deploy #6 / §3 Verify #8 / §5 Rollback #6 의 단일 출처. 운영 결과 모니터링은 release-checklist §4 Post-deploy #5(hosted_service status 캐시) + 본 운영 가이드 §3 의 회귀 baseline.
- **호스팅 e2e CI 운영 가이드 (v0.8.13 / TASK-176~178)**: `.github/workflows/nightly-e2e.yml` 의 `hosting-e2e` 잡은 `schedule(cron 04:00 UTC)` + `workflow_dispatch` 전용으로 봉인(TASK-171 / v0.4.1)되었으나 운영자/AI agent 가 잡의 신호 강도 / 환경 / 트러블슈팅을 참조할 운영 가이드가 부재했다. `docs/operations/hosting-e2e-ci-2026-07-27.md` 9 섹션 — §1 왜 / §2 트리거 구조 / §3 잡 7 step / §4 `e2e-hosting.sh` 실행 사이클 / §5 신호 강도 / §6 환경 / §7 로컬 재현 절차 + 트러블슈팅 5 case / §8 한계와 follow-up 3종(`hosting-e2e-fast` 잡 / status 캐시 슬라이스 / kind 로그 GHA artifact 업로드) / §9 결정. 운영 가이드 신규 (코드 변경 0 / 스크립트 변경 0 / SQL 변경 0).
- **v0.9.0 Helm/ArgoCD 실 e2e**: `bash apps/runner/scripts/e2e-helm-deploy.sh` (Helm install/status/uninstall), `bash apps/runner/scripts/e2e-hosting.sh` (hosted HTTP path/subdomain 및 lifecycle), `bash apps/runner/scripts/e2e-argocd-deploy.sh` (ArgoCD Application Synced/Healthy + managed Deployment/Service 생성·삭제) 모두 kind 기반 로컬 실측 PASS. ArgoCD e2e는 테스트용 local Git source와 Ingress 비활성 chart values를 사용하며, 실제 hosted HTTP ingress 검증은 `e2e-hosting.sh`가 담당한다. 릴리스 후보 기록은 [`RELEASE_NOTES-v0.9.0-2026-08-04.md`](../RELEASE_NOTES-v0.9.0-2026-08-04.md) 참조.
- **Workflow meta drift 가드 (v0.8.13 / session-end skill)**: 표준 ai-workflow 키트에 *session-start ↔ session-end* 쌍 skill 이 봉인되면서 세션 종료 시점에 workflow meta 정합성을 5종 가드로 검증. `ai-workflow/skills/session-end/scripts/run_session_end.py` (G1 state.json JSON 유효 / G2 current_baseline semver == HEAD latest tag / G3 state.session.rev 정합 / G4 latest_backlog_path 정합 / G5 5종 package.json version 통일). 기본 read-only 검출, `--apply --approval-actor` 모드에서 G3/G4/G5 안전 보정 + `state.json.bak.<ts>` 백업. **pre-push hook 편입 helper** (`scripts/pre-push-session-end.sh` + `.grok/hooks/install-pre-push.sh`) — 운영자가 `bash .grok/hooks/install-pre-push.sh` 로 `.git/hooks/pre-push` 설치 후 `git push` 시점에 drift 자동 차단. 의도적 우회: `SKIP_SESSION_END_GUARD=1 git push ...`.
- 출처: `docs/sdlc/08-build-server-tech-stack-baseline.md`, `docs/sdlc/09-repository-package-structure-baseline.md`
- 소스 아카이브 라운드트립 (TASK-066 + TASK-106): `POST/GET/DELETE /builds/:buildId/source` 3종 (legacy single-shot) + `POST /builds/:buildId/source/chunk` (TASK-106 chunked split 신규 endpoint). Skill 은 `POST /builds` 로 `sourceArchive` 메타데이터 (objectKey + sha256 + size) 를 선언한 뒤, 동일 buildId 로 raw archive bytes 를 `application/octet-stream` 으로 POST. **Chunked path (TASK-106)**: caller 가 archive 를 N chunks 로 split (each ≤ 256 MiB Fastify bodyLimit) 후 각 chunk 를 `POST /builds/:buildId/source/chunk` 로 upload. Per-chunk `X-Source-Checksum-Sha256` header + 서버측 recompute mismatch → 400. `X-Chunk-Is-Final: true|false` response header 로 caller 가 upload 종료 인지. Multi-row schema `build_source_chunk` (id / build_id FK CASCADE / idx / bytes BYTEA / size_bytes / checksum_sha256 / created_at + `(build_id, idx)` unique index) — migration 0006. Runner 는 `GET /builds/:buildId/source` 로 bytes + `X-Source-Checksum-Sha256` 헤더 검증 (chunked envelope 우선 reassemble → legacy row fallback) 후 `<workspaceRoot>/<buildID>/src/` 에 추출. 재업로드/교체 는 last-write-wins (legacy ↔ chunked 사이 cross-write 시 한 쪽 wipe), cleanup 은 `DELETE /builds/:buildId/source` (두 side 동시 delete). e2e: `apps/build-server/scripts/e2e-source-archive.sh` (memory, legacy) + `e2e-source-archive-postgres.sh` (postgres, legacy bytea direct verify) + `e2e-source-archive-chunked.sh` (memory, TASK-106 chunked) + `e2e-source-archive-chunked-postgres.sh` (postgres, TASK-106 chunked bytea direct verify).
- **Chunked wire-format RFC 7233 호환 의미 C (TASK-108)**: TASK-106 의 wire-format 정의의 `Content-Range: bytes <start>-<end>/<total>` 헤더를 의미 C bipartite 로 완전 봉인. Callers that supply `Content-Range` 의 semantic A path (start offset 신뢰, `idx = floor(start / 16 MiB)`, end = start + length - 1 cross-check, total = declared cross-check). Callers that omit `Content-Range` 은 TASK-106 의미 B monotonic fallback. 같은 envelope 의 `(build_id, idx)` unique invariant 공유. 신규 TypeScript: `ContentRangeParts` / `ContentRangeParse` / `parseContentRange(header)` / `MAX_CONTENT_RANGE_TOTAL_BYTES = 1 GiB`. 신규 회귀 가드 4 case (의미 A start=0 / 의미 A start=16 MiB → idx=1 / 의미 A end mismatch → content_range_invalid / 의미 C bipartite semantic B fallback). 신규 wire-format response: 416 Range Not Satisfiable (RFC 7233 §4.4) for `parseContentRange` invalid. SQL / schema / migration 변경 0 — wire-format processing amend 만. 자세한 절차: [`docs/operations/content-range-rfc-7233-2026-07-20.md`](operations/content-range-rfc-7233-2026-07-20.md) 참조.
- **Chunked wire-format RFC 7233 `*` 케이스 (TASK-109)**: TASK-108 의 wire-format 정의의 `Content-Range: bytes <start>-<end>/*` (RFC 7233 §4.2 unknown total) 케이스에 대한 dynamic boundary check. Content-Range.total 부재 시 numeric equality check skip, 단 chunk 의 `[start, end]` 가 `BuildRequest.sourceArchive.sizeBytes` 이내인지 검증 (`end + 1 ≤ declaredTotalSizeBytes` → 400 `size_mismatch`). 신규 회귀 가드 3 case (`*` + declared 안 넘는 chunk / `*` + boundary over → size_mismatch / numeric total regression 가드). 3 종 분기: ① numeric total + declared mismatch → content_range_mismatch ② `*` total + boundary over → size_mismatch ③ 그 외 → 정상. SQL / schema / migration 변경 0. 자세한 절차: [`docs/operations/content-range-rfc-7233-star-2026-07-20.md`](operations/content-range-rfc-7233-star-2026-07-20.md) 참조.
- **Chunked wire-format RFC 7233 strict 모드 env flag (TASK-110)**: TASK-109 의 lenient default 의 운영적 override. `STRICT_CONTENT_RANGE=true` env flag 가 active 일 때 RFC 7233 §4.2 의 `*` total 케이스를 거절 + caller 가 numeric total 의무화 (400 `content_range_invalid`). `apps/build-server/src/app/create-app.ts` 의 `parseStrictContentRangeFlag` helper 가 boot-time 1 회 parsing + BuildService 의 `{ strictContentRange }` runtime field 에 저장. 기본값 `false` (TASK-109 lenient 정합). 신규 회귀 가드 4 case (strict ON + numeric ok / strict ON + `*` → content_range_invalid / strict OFF + `*` ok / strict ON + numeric mismatch). 4 종 분기: ① strict ON + `*` total → content_range_invalid ② strict + numeric + declared mismatch → content_range_mismatch ③ 비-strict + `*` total + boundary over → size_mismatch ④ 그 외 → 정상. SQL / schema / migration 변경 0. 자세한 절차: [`docs/operations/content-range-rfc-7233-strict-mode-2026-07-20.md`](operations/content-range-rfc-7233-strict-mode-2026-07-20.md) 참조.
- **Chunked wire-format RFC 7233 호환 follow-up 권장**: TASK-106 의 chunked endpoint 가 `Content-Range: bytes <start>-<end>/<total>` 헤더를 wire-format 정의로 적시만, 실제 구현은 idx = monotonic sequence (`envelope.chunks.size` / `priorCount.length`) 만 사용. TASK-066 follow-up batch 4 후보로 명시. 결정 분리 3 종:
  - **의미 A — start offset 신뢰**: caller 의 `Content-Range` 를 신뢰해 chunked envelope 의 idx derivation. Out-of-order upload 강함. Caller 가 잘못된 offset 을 보내면 chunk 위치 corrupt 가능.
  - **의미 B — chunked size 만 신뢰 (현 상태 정합)**: `Content-Range.total` 만 `BuildRequest.sourceArchive.sizeBytes` cross-check 용도로 사용. caller 의 monotonically increasing 가정. Out-of-order upload 불가.
  - **의미 C — Content-Range 가 있으면 의미 A, 없으면 의미 B**: bipartite — caller 가 RFC 7233 호환을 명시하면 의미 A, 미명시이면 기존 monotonic sequence (TASK-106 동작 보존).
  HTTP 표준 동작을 caller 에게 노출하려면 의미 C 권장. 신규 회귀 가드 (RFC 7233 wire-format 4 case — partial / total / multipart-byte-range / start-offset mismatch) + 운영 가이드. SQL / schema / migration 변경 0 (route layer 의 wire-format 처리만).
- 메모: `apps/build-server`는 현재 `BUILD_REPOSITORY_BACKEND=memory|postgres` 두 경로를 모두 가진다. `postgres`는 Colima + Docker + `docker-image-builder-postgres`(127.0.0.1:15432) 기준 live smoke까지 통과했다. 현재 `tsconfig` 산출물은 `dist/apps/build-server/src/index.js` 경로를 사용한다. `pnpm --filter @docker-image-builder-system/build-server dev` 는 `tsx` build script 승인 이후 dev watch 경로로 재개방한다.
- 외부 deploy (TASK-068 + TASK-071a robustness): `apps/runner/internal/deploy/client.go` adapter 는 `RUNNER_DEPLOY_MODE` env 로 `skeleton` (default, `deploy-result.json` 만 workspace 에 emit) / `cli` (real `docker tag <sourceImage> <targetRef>:<buildID>` + `docker push`, timeout `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` default 120s) 두 모드 지원. `RUNNER_DEPLOY_TARGET_TYPE` (default `DOCKER_REGISTRY`) / `RUNNER_DEPLOY_TARGET_REF` (default `registry.example.com/docker-image-builder-system`) / `RUNNER_DOCKER_BIN` (default `docker`). BuildService.ProcessClaim 가 `containerStatus.ImageTag` 를 `DeployOptions.SourceImage` 로 전달 — cli mode 일 때 registry 에 push, skeleton mode 일 때 SourceImage 무시 (기존 동작 보존). TASK-071a 로 `runWithTimeout(parentCtx, fn, args...)` helper 도입 — tag / push / future steps 동일 pushTimeout (default 120s) budget 으로 강제 종료. 기존 v1 (TASK-068) 의 `runPush` 만 timeout 이었던 asymmetry 해소. 외부 interface (`PushTimeout()` / `RUNNER_DEPLOY_PUSH_TIMEOUT_SECONDS` env) 그대로 유지. e2e: `apps/runner/scripts/e2e-deploy-push.sh` (Build Server memory backend + local `registry:2` 부팅 + busybox Dockerfile + Runner cli mode + registry `/v2/<repo>/tags/list` 검증 + cleanup). TASK-071a 추가 보강으로 busybox 미설치 환경에서는 자동으로 deploy-only 시나리오 (`RUNNER_DOCKER_RUN_MODE=skeleton` — build cli + run skeleton mock + deploy cli) 로 전환되어 offline 환경에서도 deploy 단계 (tag + push) 만 실제 검증 가능. **M5 (Deployment Capability) milestone 종료** — TASK-059 / TASK-064 / TASK-068 / TASK-071a 가 main 모두 합류되어 docs/sdlc/15 §5 완료 기준 5 항목 모두 충족. 후속: TASK-072 `RUNNER_REGISTRY_CONFIG_DIR` env 도입 (private Docker Hub / ECR / GCR 인증) + 다른 deploy target axis 확장 옵션.

## 3.1 활성 워크플로우 자산 (Active Skills / MCPs)
- 본 프로젝트가 표준 워크플로우 키트(`ai-workflow/`)에서 active로 채택한 자산을 정리한다. 미채택 prototype은 명시적으로 deferred 처리한다.
- 출처: `docs/PROJECT_PROFILE.md` §2 문서 경로, `ai-workflow/harnesses/codex/apply_guide.md` §2.1/§2.2, `ai-workflow/skills/README.md`, `ai-workflow/mcp_servers/README.md`
- 관련 결정: TASK-023 workflow skill/MCP 셋업

### 3.1.1 Active Skills (`ai-workflow/skills/`)
- `session-start` — 세션 시작 시 `ai-workflow/memory/active/` 핵심 문서 + 본 프로젝트 문서 경로를 자동 복원
- `backlog-update` — `work_backlog.md` ↔ `backlog/<date>.md` 동기화
- `doc-sync` — 변경 파일에 영향받는 `docs/` 후보 추천 및 링크/메타 점검

### 3.1.2 Active MCP Servers (`ai-workflow/mcp_servers/`)
- `latest-backlog` — 가장 최신 날짜의 backlog markdown 경로 조회
- `check-doc-links` — 상대 링크 무결성 검사
- `check-doc-metadata` — markdown 메타데이터 누락 검사

### 3.1.3 Deferred (현재 미채택)
- Skills: `merge-doc-reconcile`, `validation-plan`, `code-index-update` — 본 프로젝트는 아직 merge conflict/대규모 인덱싱 단계가 아니므로 보류
- MCP: `create-backlog-entry`, `suggest-impacted-docs`, `check-quickstart-stale-links` — 위 active 3종으로 먼저 운영 자동화를 검증한 뒤 활성 검토

### 3.1.4 Transport / 노출 상태
- 키트 prototype의 실제 MCP transport 계층은 표준 키트 측에서 미구현 상태이며, 본 프로젝트는 `.codex/config.toml.example`을 additive로 유지한다 (`transport_ready=false` 명시).
- 전역 `~/.codex/config.toml`에 프로젝트별 명령이나 backlog 경로를 직접 넣지 않는다 (`apply_guide.md` §2.3, §8).

## 3.2 Admin 엔드포인트 (ADMIN-* task group)
- Build Server 는 운영자용 admin 엔드포인트 2종을 노출한다.
  - `GET /admin/builds` — 모든 owner 의 build summary 를 한 번에 조회 (BuildListQuery 호환, `requestedBy` filter 도 그대로 지원).
  - `GET /admin/users` — 빌드 history 가 있는 userId 별 `buildCount` / `lastBuildAt` rollup.
- 인증 계약 브라우저 E2E (TASK-184): `pnpm --filter @docker-image-builder-system/build-monitor test:e2e:auth`는 테스트 전용 signed fixture token으로 Vite proxy와 Build Server를 함께 띄워 public build/source 제출, owner 조회, cross-tenant 404, logout token cleanup을 검증한다. CI/nightly는 `.github/workflows/nightly-e2e.yml`의 `auth-browser-e2e` job에서 동일 테스트를 실행한다. 이 fixture token은 실제 IdP 발급 경로가 아니다.
- 인증: `X-Admin-Id` header 가 build server 의 `ADMIN_IDS` env (default `admin,yky.lee`) 에 포함될 때만 허용. 미일치 시 401 (header 누락) / 403 (not in allow-list).
- Phase 1 인증 foundation: `AUTH_SECRET`을 설정하면 관리자 API와 Runner 제어 API, 일반 principal의 build 조회 API가 `Authorization: Bearer <HS256 token>`을 요구한다. 불특정 사용자는 `POST /builds`로 `appName`과 `requestedBy`를 제출하고 source bytes/chunks를 업로드할 수 있지만, build 목록·상세·로그·source 조회·삭제와 `/services` 조회는 token의 `sub` owner 범위로 제한된다. `admin` role은 전체 build/service 조회를 허용한다. 토큰 payload는 `{ "sub": "<owner>", "roles": ["user"|"admin"], "exp": <unix seconds> }` 형식이며, 만료·위조 토큰은 보호 API에서 401, 다른 owner의 리소스는 404, `admin` role 없는 `/admin/*` 요청은 403이다. `AUTH_SECRET` 미설정은 기존 self-dogfood 호환 모드이며 외부 노출 환경에서는 사용하지 않는다. 현재 토큰 발급은 외부 IdP/issuer 연동 전 단계로 운영 secret 보관 경로에서만 수행한다.
- 공개 build 제출 정책(현재): build 생성(`POST /builds`)과 source 업로드(`POST /builds/:buildId/source`, `/chunk`)만 인증 없이 허용한다. React client의 `accessToken` storage bridge는 IdP 연동 전 개발·검증용 임시 경로이며, 운영 beta에서는 짧은 수명의 secure httpOnly session/OIDC adapter로 교체해야 한다. `requestedBy`는 public 제출 시 입력되는 owner 후보 문자열일 뿐 신원 증명이 아니다.
- session adapter 경계(TASK-185): token이 존재하는 React 요청은 `Authorization`만 전송하고 `X-User-Id`/`X-Admin-Id` caller header는 제거한다. Build Server가 검증된 principal에서 호환 header를 내부적으로 파생하는 동안만 이 bridge를 사용하며, OIDC/httpOnly session adapter가 확정되면 browser storage token을 제거한다.
- Build Server adapter 경계: HTTP auth hook은 `SessionAdapter.verifyAuthorization()`만 호출하고 route는 검증 방식(HMAC/OIDC)을 알지 못한다. 현재 `createHmacSessionAdapter`가 기본 구현이며, OIDC adapter는 issuer discovery/JWKS 검증과 secure httpOnly cookie 또는 server-side session 교환 계약이 결정된 뒤 추가한다. HMAC `AUTH_SECRET`을 OIDC secret처럼 재사용하거나 browser에 노출해서는 안 된다.
- TASK-186 runtime foundation: `SessionAdapter.verifyRequest({ authorization, cookie })`는 비동기 request 경계이며 HMAC·OIDC·composite 구현을 교체할 수 있다. `SessionStore`는 opaque session의 TTL/revoke와 one-time OIDC flow state를 저장한다. `AUTH_MODE=oidc`는 OIDC adapter가 연결되기 전 기동을 거부하며, 실제 provider callback/JWKS와 Redis/Postgres adapter는 후속 구현에서 추가한다.
- OIDC client foundation: `apps/build-server/src/auth/oidc-client.ts`는 표준 discovery, authorization-code + PKCE(S256), issuer/audience/JWKS/nonce 검증, `sub`·role claim·`exp` principal 정규화를 제공한다. role claim은 `OIDC_ROLE_CLAIM`(기본 `roles`)으로 지정하며 `realm_access.roles` 같은 dotted path와 문자열/배열 값을 지원한다. ID token에 역할이 없으면 동일 issuer/audience/JWKS로 검증한 access token에서 role claim을 fallback하며 두 token의 `sub`가 다르면 거부한다. client secret과 token은 서버 경계를 벗어나지 않는다.
- 공개 배포 ID 정책: `AUTH_MODE=disabled`에서는 인증 대신 호출자가 보낸 등록 ID(`X-User-Id`)를 빌드·서비스 소유자와 조회 범위의 기준으로 사용한다. ID가 없는 요청은 `public` 기본 scope로 격리되며, ID 자체는 인증 토큰이 아니므로 네트워크 경계가 신뢰된 환경이어야 한다.
- OIDC route foundation: 명시적으로 주입된 OIDC client/session store에서만 `/auth/login`, `/auth/callback`, `/auth/session`, `/auth/logout`를 등록한다. callback state는 server-side one-time flow로 소비하고, 성공 시 `Secure; HttpOnly; SameSite=Lax` opaque cookie를 발급한다. provider/store 의존성이 없는 기본 실행은 OIDC route를 활성화하지 않는다.
- OIDC browser E2E: `apps/build-monitor/test:e2e:oidc`는 ephemeral RS256 issuer의 authorization-code/PKCE callback을 실제 Chrome에서 수행하고, Vite `/auth` proxy를 거쳐 httpOnly session bootstrap 및 owner-scoped `/builds` 조회를 검증한다. `OIDC_E2E_DATABASE_URL=postgres://... pnpm --filter @docker-image-builder-system/build-monitor test:e2e:oidc`로 Postgres-backed repository와 `PostgresSessionStore` 및 migration `0001~0019`까지 같은 harness에서 검증할 수 있다. 운영 issuer secret은 사용하지 않는다.
- OIDC runtime wiring: `AUTH_MODE=oidc` 실행 경로는 `BUILD_REPOSITORY_BACKEND=postgres`와 `OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`OIDC_REDIRECT_URI`를 요구하고, `PostgresSessionStore`를 별도 pool로 주입한다. 배포 대상이 내부 신뢰 네트워크의 공개 환경이면 `AUTH_MODE=disabled`를 명시해 `AUTH_SECRET`이 있어도 모든 API 인증을 끌 수 있다. HTTP 운영을 지원하기 위해 `SESSION_COOKIE_SECURE` 기본값은 `false`이며, HTTPS reverse proxy를 사용할 때만 `true`로 설정한다. 메모리 store 자동 fallback은 없으며 조건 미충족 시 기동을 거부한다. migration `0019_auth_session.sql`이 session 및 one-time flow 테이블을 생성한다.
- Keycloak 배포 overlay: 외부 Keycloak 연결이 가능한 환경에서는 `compose.dev.yaml`에 `compose.dev.oidc-keycloak.yaml`을 선택적으로 합친다. overlay는 `AUTH_MODE=oidc`, Postgres backend, `realm_access.roles` role claim, `OIDC_ADMIN_ROLE` 관리자 역할, ID/access token audience 설정, secure session cookie를 강제하고 issuer/client/secret/redirect URI를 환경 또는 secret manager에서 주입한다. 상세한 Keycloak client 계약과 연결 가능 환경의 최소 확인 절차는 [`docs/operations/keycloak-oidc-deployment-2026-08-18.md`](operations/keycloak-oidc-deployment-2026-08-18.md)에 있다.
- migration 0019 검증: 기존 `dibs-postgres` 컨테이너를 일시 기동해 `auth_session`/`auth_oidc_flow` 테이블·인덱스를 실제 생성하고 session/flow insert-select-delete 왕복을 확인한 뒤 컨테이너를 원래 stopped 상태로 복원했다.
- fake OIDC issuer E2E: Build Server principal suite가 ephemeral HTTP issuer의 discovery, form-urlencoded token exchange, RS256 JWKS 서명, issuer/audience/nonce 검증과 principal 정규화를 실제 네트워크 왕복으로 검증한다. 외부 IdP 계정·secret은 사용하지 않는다.
- OIDC cookie 보강: `/auth/session`은 `Cache-Control: no-store`를 반환하고 `/auth/logout`은 `Origin`이 현재 요청 origin과 다르면 403으로 거부한다. reverse proxy 환경에서는 `X-Forwarded-Proto`를 기준으로 비교한다.
- `AUTH_SECRET`은 `shared-config` runtime 설정으로도 전달되며, 현재는 optional migration 단계다. Runner는 `RUNNER_AUTH_TOKEN`을 통해 bearer token을 전송하고, `AUTH_MODE=required` 전환 시에만 해당 값을 강제한다.
- `AUTH_MODE=disabled|legacy|required|oidc`를 지원한다. 내부 self-dogfood의 Compose와 Kubernetes control-plane 예시는 `AUTH_MODE=disabled`를 명시하고, 호출자가 보낸 등록 ID(`X-User-Id`)를 `requestedBy` 및 build/service 조회 scope로 사용한다. 이 ID는 인증이 아니므로 해당 배포는 신뢰된 내부 네트워크에서만 노출해야 한다. `legacy`는 기존 header 호환 모드, `required`는 `AUTH_SECRET`이 없으면 기동하지 않는 보호 모드다. 외부 운영에서는 Secret을 생성하고 `AUTH_MODE=required` 또는 `AUTH_MODE=oidc`로 명시해야 한다.
- Runner 제어 API 호출은 `RUNNER_AUTH_TOKEN`으로 bearer token을 주입할 수 있다. 값은 `AUTH_SECRET`으로 서명된 외부 발급 토큰(`roles`에 `user` 또는 `admin`, 유효한 `exp`)이어야 하며 Runner가 secret 자체를 보관하거나 발급하지 않는다. 비어 있으면 legacy 호환을 유지하고, `AUTH_MODE=required` 전환 시에는 각 Runner에 토큰을 주입해야 한다. 토큰 rotation은 secret 교체 후 Runner 재시작으로 적용한다.
- Runner fail-fast: 보호된 control-plane을 사용하는 배포는 `RUNNER_AUTH_REQUIRED=true`와 `RUNNER_AUTH_TOKEN`을 함께 주입한다. 토큰이 없으면 Runner가 401을 반복 polling하지 않고 시작 단계에서 종료한다. 기본값 `false`는 로컬 legacy 호환을 유지한다.
- Required-auth Compose overlay: `compose.dev.required-auth.yaml`은 `AUTH_MODE=required`, `AUTH_SECRET`, `RUNNER_AUTH_REQUIRED=true`, `RUNNER_AUTH_TOKEN`을 한 번에 정렬한다. 두 secret 값은 repository에 저장하지 않고 shell/secret manager에서 주입하며, 누락 시 `docker compose config` 단계에서 실패한다. runner-multi override와 함께 사용할 때는 이 파일을 마지막에 전달한다.
- Multi-runner auth 정렬: `compose.dev.runner-multi.yaml` 및 `compose.dev.runner-multi-postgres.yaml`의 `runner2`/`runner3`도 동일한 `RUNNER_AUTH_REQUIRED`/`RUNNER_AUTH_TOKEN`을 받으며, required overlay를 합치면 세 runner 모두 token 누락 시 fail-fast한다.
- Kubernetes required-auth 예시: `examples/k8s-control-plane-required-auth.yaml`는 기존 disabled control-plane 예시와 분리된 standalone manifest로 Postgres, `AUTH_MODE=required`, `AUTH_SECRET`/`DATABASE_URL` Secret 주입을 제공한다.
- Kubernetes Runner auth 예시: `examples/k8s-runner-required-auth.yaml`는 `RUNNER_AUTH_REQUIRED=true`와 `RUNNER_AUTH_TOKEN` Secret 주입, cluster-local control-plane URL을 제공한다. 이 예시는 현재 host Docker socket을 mount하므로 untrusted build 운영용이 아니며, runner ServiceAccount/RBAC·rootless sandbox 격리는 Phase 2 후속이다.
- Queue lease recovery(TASK-180): `BUILD_LEASE_TIMEOUT_MS`(기본 900000ms)가 지나도록 `PREPARING_SOURCE`/`BUILDING`/`TEST_SUCCESS` 상태에서 heartbeat(phase 보고)가 없는 build는 다음 claim 시 `QUEUED`/`REQUEST_ACCEPTED`로 되돌려 다른 Runner가 재시도한다. `0`은 복구를 끈다. 복구 이벤트는 build log에 남으며 terminal 상태에는 적용하지 않는다.
- required-mode 전환/rotation 절차: (1) Build Server와 토큰 issuer가 공유할 새 `AUTH_SECRET` 및 Runner별 서명 토큰을 준비하고, (2) Secret/env 저장소에 `AUTH_SECRET`, `AUTH_MODE=required`, `RUNNER_AUTH_TOKEN`을 함께 반영한 뒤, (3) Runner를 먼저 재기동해 새 토큰을 적용하고, (4) public `POST /builds`·source upload와 authenticated build list/detail 왕복을 smoke 검증한다. 검증 후 이전 secret·토큰을 폐기한다. 일반 사용자의 build 등록만 이 전환에서도 공개 정책을 유지하며, 조회는 owner token을 요구한다.
- OpenAPI: `Admin` tag 가 추가됐고 `/admin/*` paths, `AdminListBuildsQuery` / `AdminListBuildsResponse` / `AdminUserBuildSummary` / `AdminUserListResponse` components 가 emit 된다. `/docs` Swagger UI 에서 확인 가능.
- build-monitor 측 진입점 (TASK-076 + TASK-077 + TASK-084 + TASK-097 + TASK-098): `/admin/login` 라우트는 제거됐다. 일반 Login 페이지(`/login`)에서 userId 입력 → localStorage `userId` 키에 저장 → admin allow-list (`ADMIN_IDS`) 에 해당 userId 가 포함되어 있으면 React 측 `Header` 가 단일 "Admin" 진입점 (`/admin/builds`) 을 자동 노출한다 (`X-Admin-Id` 헤더는 userId 그 자체로 채워짐). admin 섹션 (Builds / Users / Admins / Runners) 사이의 이동은 페이지 상단 공통 탭 바 `<AdminTabs />` (React 측 `react/src/components/AdminTabs.tsx` + react-router-dom NavLink) 가 담당한다 — `Header` 는 더 이상 4개의 섹션 링크를 나열하지 않는다. 별도 admin login / admin logout 단계가 없다 — 일반 Logout 한 번에 userId 가 clear 되면 admin 메뉴도 함께 사라진다. userId 가 admin allow-list 에 없는 상태에서 `/admin/*` 라우트로 직접 진입하면 React 측 `<AdminAccessDenied />` 패널이 친절한 안내 + "Back to Builds" / "Switch user" 두 액션을 노출한다 (TASK-084 frontend 가드 — backend 의 401/403 envelope 직접 노출 회피). backend 동작은 변경 없음 (defense in depth — frontend 가드 통과 후에도 Build Server 의 `X-Admin-Id` 401/403 envelope 그대로 유지).
- 회귀 (TASK-098 + TASK-100 + TASK-101 + 디자인 토큰 단일화 TASK-096.5 + 디자인 가드 TASK-084): TS 5 packages `tsc --noEmit` clean, build-monitor vitest **130/130 PASS** (TASK-088 baseline 7 → 244 in M4.5 → 130 in TASK-101 with Svelte 135 case 일괄 삭제), svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리로 불필요), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, vite build svelte script 제거 (TASK-101), build-server 143/143 PASS (TASK-101 baseline), e2e-single-port PASS. frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) 까지 16 TASK 연속 봉인 완료 (2026-07-08 ~ 2026-07-18).
- 운영 가이드 (운영 환경 배포 시 필수): `ADMIN_IDS` 는 시크릿처럼 취급 — 외부 저장소/PR description/issue 에 노출 금지. CORS 기본값은 same-origin(`CORS_ORIGIN=false`)이며, 외부 origin이 필요한 경우에만 명시 origin 화이트리스트를 주입한다(`CORS_ORIGIN=true` wildcard는 개발용으로만 허용). admin 인증은 평문 id 비교이므로 SSO/JWT 로의 마이그레이션은 후속 ADMIN-* task group 에서 다룬다.
- Production startup observability: `NODE_ENV=production`에서 CORS wildcard 또는 `AUTH_MODE=legacy`가 남아 있으면 Build Server가 기동은 유지하되 구조화 warning을 남긴다. 배포 로그에서 두 경고가 모두 사라지는 것을 private beta 진입 확인 항목으로 삼는다.
- **Postgres backend default 개발 경로 (TASK-066 follow-up batch 3)** — TASK-066 (source archive bytea) + TASK-081-B (multi-runner) + TASK-082 (multi-runner postgres) 가 모두 main 합류되어 Postgres backend 가 memory backend 와 동등한 운영 baseline 으로 사용 가능. 운영 환경 (production) 은 Postgres 만 사용하므로 dev ↔ production 환경 drift 최소화를 위해 Postgres 를 default 개발 경로로 권장. memory backend 는 단일 runner / 단일 build / 빠른 smoke / CI / 디버깅용 보조 경로. 운영 명령 + 5 단계 회귀 가드 + Postgres 운영 권장 사용처 + follow-up 은 [`docs/operations/source-archive-postgres-2026-07-18.md`](operations/source-archive-postgres-2026-07-18.md) 참조.

## 3.3 Build Monitor UI 정합 (TASK-083 + TASK-095 + TASK-096 + TASK-096.5)
- 의도: admin 4 페이지 (Builds / Users / Admins / Runners) + BuildsList + Login + BuildDetail + BuildRequest + ApiConsole + Header 의 시각 정합 — `.page` wrapper + `<header class="page-head">` 컨테이너 + fadeIn 애니메이션 + h1 gradient text + `var(--size-xxl)` 단일 source, chip 디자인의 canonical 컴포넌트화 (FilterChips), 디자인 토큰 단일화 (Svelte baseline 60+ 토큰 + light/dark cascade 의 React 측 사본 — `react/src/tokens.css`).
- TASK-095 (Header / ThemeToggle / FilterChips React 마이그레이션): React 측 `apps/build-monitor/react/src/components/{Header, ThemeToggle, FilterChips}.tsx` 신규 추가 + `adminAllowListStore` (Zustand) + `Header` 가 모든 route 에서 mount (`App.tsx`).
- TASK-096 (StatusPill 디자인 토큰 baseline 정합): React 측 `StatusPill.tsx` 가 12 canonical + 2 legacy + RunnerStatus 상태 매핑 + Svelte baseline 정합.
- TASK-096.5 (디자인 토큰 단일화): Svelte `tokens.css` 가 단일 source-of-truth. React 측 `tokens.css` 사본이 우리 토큰 정의. Astryx Theme 컴포넌트 보호용 `theme.css` 별도 layer 분리. `globals.css` 의 placeholder fallback 정리 (`#app` → `#app-react` 정합).
- 회귀: TS 5 packages `tsc --noEmit` clean, build-monitor vitest **130/130 PASS** (TASK-101 baseline), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**. Header sticky bar 의 1px light-only shadow 는 의미적으로 `--shadow-card` 와 구분되어 후속 TASK (sticky-bar 디자인 토큰 신설) 후보로 보류.

## 3.4 Admin 가드 deep link UX (TASK-084 + TASK-097)
- 의도: TASK-076/077 의 admin 진입점 통일까지는 backend 가 401/403 으로 거부하지만 frontend 가 친절한 안내 없이 raw error envelope 을 그대로 노출하던 결함(`docs/operations/dogfood-e2e-review-and-followup-2026-07-06.md` §3.4 G-4 gap) 봉인. 비-admin user (`alice` 등 `ADMIN_IDS` env 부재) 가 `/admin/builds` 같은 deep link 를 직접 입력했을 때 backend 호출 없이 frontend 에서 거부 → React 측 `<AdminAccessDenied />` 패널이 reason-aware 메시지 + "Back to Builds" / "Switch user" 두 액션을 노출한다.
- 핵심 컴포넌트 + helper (단일 source):
  - `apps/build-monitor/react/src/lib/admin-guard.ts` — `ensureAdminAccess(callerId)` helper. `adminAllowListStore` (Zustand) 캐시가 비어 있으면 refresh 시도 후 `contains` 체크. 결과는 `{ isAdmin, allowList, reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }`. backend 가 401/403 으로 거절한 케이스만 `FORBIDDEN` 으로 표면화 — 나머지 (5xx / 빈 캐시) 는 `NOT_IN_ALLOW_LIST` fallback (사용자가 새로고침하면 재시도).
  - `apps/build-monitor/react/src/components/AdminAccessDenied.tsx` — 공통 권한 없음 패널. `page-head` + danger accent h1 + Login.tsx `.card` 패턴 차용 카드 + 두 액션 (`Back to Builds` 는 userId 유지하며 `/builds` 로 이동, `Switch user` 는 userIdStore clear 후 `/login` redirect).
- amend: `AdminBuilds.tsx` / `AdminUsers.tsx` / `AdminAdmins.tsx` / `AdminRunners.tsx` — useEffect 첫 단계에서 (1) `userId` 부재 시 navigate("/login") (기존), (2) `ensureAdminAccess(userId)` 호출, (3) `!isAdmin` 시 `accessDenied` state set + 친절한 패널 노출. backend 호출 (listAdminBuilds / listAdminUsers / listAdminRunners / refresh)은 frontend 가드 통과 후에야 일어남 — raw 403 envelope 이 화면에 노출될 surface 가 사라진다.
- Backend 동작은 변경 없음. Build Server 의 `X-Admin-Id` 401/403 envelope (TASK-049 / TASK-076) 은 그대로 유지 — frontend 가드 통과 후에도 backend 는 동일하게 한 번 더 검증 (defense in depth).
- 회귀 가드 (TASK-143 정정): `admin-guard.test.ts` 는 `ensureAdminAccess` **헬퍼 로직**을 덮는다. **라우트가 실제로 그 가드를 호출하는지** 는 `react/src/routes/admin-routes.test.tsx` (TASK-143 신규) 가 통합 레벨로 덮는다 — 4 라우트 공통 3 시나리오 (userId 없음 → `/` redirect + backend 미호출 / 비-admin → AdminAccessDenied + backend 미호출 / admin → 정상 렌더 + 목록 API 호출) + 페이지 고유 회귀 (AdminBuilds 유령 헤더 / AdminUsers recent 패널 / AdminRunners Register Runner).
  - **경위**: 이 자리에는 원래 "admin 페이지 test 4종 5건" 이 있었는데, 그 테스트는 **Svelte 트리에만** (`src/routes/Admin*.test.ts`) 존재했고 TASK-101(`313ae2e`)이 Svelte scaffold 를 정리하며 삭제했다. React 트리로는 이관된 적이 없어 admin 가드 라우트 레벨 회귀가 2026-07-18 이래 부재했다 (TASK-137 발견 / TASK-142 유령 헤더 결함의 직접 원인). TASK-143 이 React 통합 테스트로 복원하며 본 서술을 정정했다.
- 회귀 (TASK-143 기준): TS 5 packages `tsc --noEmit` clean, build-monitor vitest **281 PASS** (Astryx 이관 시리즈 TASK-136~143 누적).

## 3.5 Production semantic 운영 검증 (TASK-085)
- 의도: TASK-081-B / TASK-082 의 dummy (size 0 source) 검증이 build 가 FAILED 로 끝나는 시나리오만 다뤘던 한계를 보완. busybox/scratch Dockerfile + 실제 `tar.gz` source archive 로 build 가 COMPLETED 까지 가는 운영 시나리오 자동 재현. `docs/operations/dogfood-e2e-2026-07-06.md` §2.2 의 `bab5995f-…-95d53684263d` (수동 dogfood) 의 자동 재현 동등물.
- 핵심 변경:
  - `apps/build-server/scripts/e2e-production-semantic.sh` 신규 — 7 단계 자동 검증 (busybox pull warm-up → compose up → build-server health → runner registry → source archive POST → build COMPLETED → 10 phase + preview URL 검증 → container cleanup).
  - `compose.dev.e2e-production.yaml` 신규 override — single runner + `RUNNER_DOCKER_BUILD_MODE=cli` / `RUNNER_DOCKER_RUN_MODE=cli` / `RUNNER_DEPLOY_MODE=skeleton` / `RUNNER_STOP_CONTAINER_ON_DONE=true` / `RUNNER_INTERNAL_PORT=8080` / `RUNNER_HEALTHCHECK_PATH=/` / `RUNNER_HEALTHCHECK_TIMEOUT_SECONDS=60` / `network_mode: host` (host network namespace 공유로 spawn container 의 published host port 가 runner 의 localhost 에 노출).
  - `apps/runner/internal/docker/client.go` 보강 — `RunContainer` 의 host port auto-assign path 의 `docker inspect` 를 최대 5 회 × 200ms 로 retry. 빈 응답 시 다음 시도까지 대기, port 가 확인된 즉시 break. 회귀 가드 `TestRunContainerCliModeInspectRetriesUntilPortAppears` + `TestRunContainerCliModeInspectAllAttemptsEmptyLeavesHostPortZero` 신규.
- 사전 결함 + 보강 3건 (자세한 내역은 `docs/operations/production-semantic-2026-07-07.md` §5):
  - busybox `httpd` 의 default Basic Auth (`/login` 302 redirect) → e2e Dockerfile 의 `printf 'A:*\n' > /etc/httpd.conf && httpd ... -c /etc/httpd.conf` 로 permissive access rule 명시 적용.
  - docker inspect race (hostPort=0) → 위 retry 보강.
  - compose bridge network 의 host namespace 격리 → `network_mode: host` override.
- 회귀 baseline (TASK-101 baseline 동기화): TS 5 packages `tsc --noEmit` clean, build-server node:test **143/143 동일** (backend 변경 0), build-monitor vitest **130/130 동일** (frontend 변경 0 — React baseline), Go 7 packages 모두 PASS (기존 + 신규 docker test 2건), svelte-check script 제거 (TASK-101 Sitelist scaffold 일괄 정리), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, `e2e-production-semantic.sh` **ALL PASS** (cold start 30s + busybox pull warmup 10s + build lifecycle ~30s + cleanup, 총 ~2분). 운영 가이드 [`production-semantic-2026-07-07.md`](operations/production-semantic-2026-07-07.md) (TASK-085 메모리 variant 신규, TASK-112 봉인 — 운영자가 메모리 / postgres 양 variant 를 한 자릿에서 식별 가능).
- **Postgres backend 회귀 (TASK-102 baseline 양축 동기화)**: `apps/build-server/scripts/e2e-source-archive-postgres.sh` 5 단계 (POST /builds → POST /source → bytea direct verify → GET /source → DELETE /source) 모두 PASS — TASK-066 봉인 시점에 memory backend 와 동등 baseline 검증 완료. postgres migration 0001 (`app_name`) / 0002 (`phase_history`) / 0003 (`build_test` / `deployment_attempt`) / 0004 (`build_source` bytea + FK CASCADE) / 0005 (`runner_registry`) 모두 적용 정상. TASK-082 `e2e-multi-runner-postgres.sh` ALL PASS (postgres backend multi-runner 3개 적재, 영속 검증 포함). `e2e-production-semantic.sh` 는 memory backend 전용 회귀 가드 — **Postgres backend 동등 보강은 TASK-111 신규 봉인 완료** (`e2e-production-semantic-postgres.sh` 8 단계 + 신규 postgres 전용 psql verify + bytea 재검증).
- **Production-semantic Postgres backend (TASK-111)**: TASK-085 의 production-semantic 운영 검증 (busybox/scratch Dockerfile + 실제 tar.gz source archive 의 build COMPLETED 까지 운영 시나리오)의 postgres backend 동등 보강. 신규 `compose.dev.e2e-production-postgres.yaml` (postgres profile + build-server 의 postgres backend 전환) + 신규 `e2e-production-semantic-postgres.sh` (8 단계: postgres warm-up → compose up → build-server cold start + applyMigrations → psql direct verify → source archive 작성 → source archive upload + bytea round-trip → build lifecycle 대기 → 10 phase + preview URL + deploy mode 검증 → terminal-phase bytea 재검증 + container cleanup + compose down). build-server 가 postgres bytea column 에 archive 저장 → runner 가 GET /source 로 byte-precise readback → busybox Dockerfile build → busybox httpd 200 OK healthcheck → DEPLOYMENT_COMPLETED. SQL / schema / migration 변경 0. 자세한 절차: [`docs/operations/production-semantic-postgres-2026-07-20.md`](operations/production-semantic-postgres-2026-07-20.md) 참조.
- **build_source SLO + TOAST follow-up (TASK-104 봉인)**: 본 TASK 가 봉인한 `bodyLimit: 256 * 1024 * 1024` (256 MiB) SLO 와 PostgreSQL `bytea` column 의 TOAST (1 GB inline split) 동작이 현 운영 환경에서 충분함. source archive 평균 1~50 MB / 256 MiB SLO 대비 5-50x 여유. 후속 결정 후보 3종 (단순 SLO 확장 / chunked split / 외부 object storage) 는 신규 기능 트리거 발동 시 별도 TASK 로 다룸. 자세한 트리거 + 결정 분리 절차는 [`docs/operations/build-source-toast-strategy-2026-07-20.md`](operations/build-source-toast-strategy-2026-07-20.md) 참조.

## 3.6 e2e-multi-runner.sh BASE + heredoc 결함 봉인 (TASK-086)
- 의도: TASK-081-B 의 `apps/build-server/scripts/e2e-multi-runner.sh` 가 봉인될 때 못 가져간 두 가지 결함 — (1) `BASE="http://build-server:3000"` 가 docker network 내부 DNS 이름을 host shell 에서 사용, (2) `[5/6]` admin 분산 검증 의 `echo "${RUNNERS}" | python3 <<'PY'` 가 bash redirections 처리 순서상 heredoc 이 stdin 을 hijack 해서 `sys.stdin.read()` 가 항상 빈 응답 — 을 봉인. 같은 race (TASK-085 에서 발견된 runner registration 30-90s) 와 stale image caching 결함도 동시 보강.
- 핵심 변경 (amend 1 file + sibling follow-on):
  - `apps/build-server/scripts/e2e-multi-runner.sh` — `BASE="${BUILD_SERVER_URL:-http://127.0.0.1:3000}"` (TASK-082 동일 패턴), `[2/6]` runner registry 대기 30s → 90s, `[0/6] compose up` 에 `--build` 추가 (runner image caching 회피), project name 에 `$$` suffix (병렬 실행 안전), `[5/6]` heredoc 를 `RUNNERS_JSON="${RUNNERS}" python3 <<'PY'` + `os.environ["RUNNERS_JSON"]` 패턴으로 교체.
  - `apps/build-server/scripts/e2e-production-semantic.sh` follow-on — TASK-085 의 `[6/7]` 10 phase 검증 의 `printf '%s' "${LOGS_JSON}" | python3 <<PY` 도 동일 heredoc stdin hijack 결함 (그래서 우연히 동작 — `${LOGS_JSON}` shell expand 로 우회). env var 패턴 + `<<'PY'` quoted marker 로 견고화. log JSON 의 `'''` / escape 시퀀스에 silent fail 하지 않게 됨.
- 사전 결함 + 보강 4건:
  - `BASE="http://build-server:3000"` 가 host shell 에서 unresolved → `BASE="${BUILD_SERVER_URL:-...127.0.0.1:3000}"` 로 정렬 (TASK-082 동일).
  - heredoc 가 stdin pipe 를 hijack → env var 명시적 전달 패턴으로 교체.
  - runner registration 대기 30s 가 부족 (TASK-085 의 `30-90s` race 와 동일) → 90s 로 확장.
  - compose 가 cached image 사용 시 runner binary 변경 미반영 → `[0/6] compose up` 에 `--build` 추가.
- 회귀 baseline (TASK-101 baseline 동기화): TS 5 packages `tsc --noEmit` clean (변경 파일에 영향 없음), build-server node:test **143/143 동일** (스크립트만 amend — backend 변경 0), build-monitor vitest **130/130 동일** (frontend 변경 0 — React baseline), Go 7 packages 모두 PASS, svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, `e2e-multi-runner.sh` **ALL PASS** (~3-4 분 — TASK-081-B 와 정합), `e2e-production-semantic.sh` follow-on 도 동일 ALL PASS (TASK-085 회귀 baseline 유지).
- **Postgres backend 회귀 (TASK-102 baseline 양축 동기화)**: TASK-082 `e2e-multi-runner-postgres.sh` ALL PASS (8 단계 + 3 runner 적재 + 영속 검증, postgres 15432 port 기준) — §3.5 / §3.6 의 memory backend e2e 와 동등 baseline. postgres migration `0001~0005` 모두 적용 정상. 본 TASK 가 봉인한 shell heredoc / `BASE` env 결함 봉인은 memory + postgres 양 backend 의 30-90s race 와 stale image caching 모두 동시 해결.
- **Chunked multi-runner 회귀 가드 (TASK-113)**: TASK-082 의 multi-runner 운영 검증 (postgres backend) 의 chunked split (TASK-106 의미 B + TASK-108 의미 C + TASK-109 `*` + TASK-110 strict 모드) 동시 사용 운영 검증. 신규 `compose.dev.multi-runner-chunked-postgres.yaml` (postgres profile + 3 runner + `STRICT_CONTENT_RANGE: "true"`) + 신규 `e2e-multi-runner-chunked-postgres.sh` (7 단계: compose up → postgres + build-server healthy → 3 runner 등록 + strict 사전 검증 → 5 build × chunked upload (round 0..3 = 의미 B baseline 2 round + 의미 C numeric total 2 round) + strict 모드 `*` total 거부 (round 4) → 5 build lifecycle 대기 + postgres `build_source_chunk` bytea 무결성 → multi-runner buildsClaimed ≥ 3 → compose down -v). build-server 4 종 wire-format 가 multi-runner 동시 운영에서도 byte-precise bytea 무결성 + strict 모드 dispatch. SQL / schema / migration 변경 0. 자세한 절차: [`docs/operations/multi-runner-chunked-postgres-2026-07-20.md`](operations/multi-runner-chunked-postgres-2026-07-20.md) 참조.

## 3.7 Private registry 인증 foundation (TASK-073)
- 의도: TASK-081/082 의 운영 보강 후보 — `RUNNER_REGISTRY_CONFIG_DIR` env 로 docker CLI 의 registry 인증 config dir 을 override, private Docker Hub / ECR / GCR push 의 foundation. 본 TASK 는 insecure-registry 케이스로 env 전파 + cli mode push round-trip + registry catalog/tags/manifest 회귀 가드 를 봉인.
- 핵심 변경:
  - `apps/runner/internal/config/config.go` amend — `Config.RegistryConfigDir` 필드 + `parseString("RUNNER_REGISTRY_CONFIG_DIR", "")` (default empty → docker default `~/.docker/config.json` 사용, 회귀 없음).
  - `apps/runner/cmd/runner/main.go` amend — `os.Setenv("DOCKER_CONFIG", cfg.RegistryConfigDir)` 호출, 후속 모든 docker CLI invocation (`docker tag` / `docker push`) 이 그 dir 의 config.json 사용. fatal on Setenv 실패.
  - `apps/runner/internal/config/config_test.go` 신규 — `TestLoadRegistryConfigDirDefaultEmpty` + `TestLoadRegistryConfigDirFromEnv` + `TestLoadAllFieldsWithEnv` + `TestLoadPollIntervalDefaults` + `TestLoadPollIntervalAcceptsBareIntegerSeconds` + `TestSetenvIsObservableWithinSameProcess` 6/6 PASS.
  - `compose.dev.e2e-registry.yaml` 신규 — `registry:2` container (HTTP 5000 + healthcheck `/v2/`) + `runner` override (`network_mode: host` + `RUNNER_DOCKER_BUILD_MODE=cli` / `RUNNER_DOCKER_RUN_MODE=cli` / `RUNNER_DEPLOY_MODE=cli` / `RUNNER_DEPLOY_TARGET_REF=localhost:5000/docker-image-builder-system/cli` / `RUNNER_REGISTRY_CONFIG_DIR=/registry-config` + host 의 임시 config.json volume mount).
  - `apps/build-server/scripts/e2e-registry-push.sh` 신규 — 8 단계 + 보너스: busybox/registry warm-up → HOST_REGISTRY_CONFIG + config.json 생성 → compose up → registry healthy → build-server healthy → runner registered → source archive + cli push lifecycle → registry API catalog/tags 검증 → bonus manifest 검증.
  - `docs/operations/registry-push-2026-07-07.md` 운영 가이드 (동기 / 환경 / 사용 절차 / 8 단계 매트릭스 / 사전 결함 4건 / 빠른 재현 / 후속 TASK).
- 사전 결함 + 보강 4건 (운영 가이드 §5):
  1. runner binary 에 `RUNNER_REGISTRY_CONFIG_DIR` 가 없었음 — config.go + main.go amend, `DOCKER_CONFIG` env 로 docker CLI 에 propagate.
  2. compose 검증 시 `group_add` 항목 중복 — `group_add` 제거, Dockerfile 의 `addgroup runner docker` 에 의존 (TASK-078 권한 정렬 정합).
  3. `RUNNER_DEPLOY_TARGET_REF` 가 registry 의 slash split 에서 의도된 repo 가 안 잡힘 — `localhost:5000/docker-image-builder-system/cli` 로 정렬, e2e 가 catalog 에서 `docker-image-builder-system/cli` 검증.
  4. manifest v2 vs v1 schema — bonus 단계의 Accept: v2 가 v1 호환 manifest (fat manifest) 응답 시 parse 실패 가능. main 8 단계는 fatal 아님.
- 회귀 baseline (TASK-101 baseline 동기화): TS 5 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **143/143 동일** (backend 변경 0), build-monitor vitest **130/130 동일** (frontend 변경 0 — React baseline), Go 7 packages 모두 PASS + config package 신규 6/6 PASS, svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, `e2e-registry-push.sh` **ALL PASS** (~2-3 분: registry:2 cold start 5-10s + build-server healthcheck 30s + cli push lifecycle ~30-60s + cleanup).

## 3.8 htpasswd 인증 registry push (TASK-074)
- 의도: TASK-073 의 insecure-registry foundation 위에서 registry:2 의 `REGISTRY_AUTH=htpasswd` 가 enabled 일 때 cli mode docker push 가 base64 auths entry + bcrypt htpasswd entry 와 정합되어 통과하는지 검증. 운영 환경의 private Docker Hub / ECR / GCR 인증의 foundation 을 htpasswd 형식 (basic auth) 으로 봉인.
- 핵심 변경:
  - `compose.dev.e2e-registry.yaml` amend — `REGISTRY_AUTH: htpasswd` + `REGISTRY_AUTH_HTPASSWD_REALM: "Registry Realm"` + `REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd` env 3종 + `${HOST_REGISTRY_AUTH_DIR}:/auth:ro` volume mount + healthcheck `nc -z 127.0.0.1 5000` 로 단순화 (status code 무관 listen only).
  - `apps/build-server/scripts/e2e-registry-push.sh` amend — `HOST_REGISTRY_AUTH_DIR` 임시 디렉터리 + `chmod 0755` (mktemp default 0700 의 uid mismatch 회피) + `docker run --rm httpd:alpine htpasswd -nbB` 로 bcrypt hash 생성 (apr1 의 registry:v2 검증 비호환 회피) + `config.json` 의 `auths` entry key `localhost:5000` 정렬 (push target URL 과 exact match) + insecure-registries `localhost:5000` + `127.0.0.1:5000` 둘 다 + bonus-A 인증 헤더 부재 → 401 검증 + bonus-B 잘못된 credential → 401 검증 + [8/8] 인증 부착 curl + bonus-9 manifest 검증 (TASK-073 와 동일).
  - `docs/operations/registry-push-auth-2026-07-07.md` 운영 가이드 신규 (검증 결과 / 사용 절차 / TASK-073 foundation 위의 추가 4가지 보강 / 한계 / 빠른 재현 / K8s 운영 도입 패턴).
- 사전 결함 + 보강 4건 (운영 가이드 §5):
  1. config.json auths entry key 가 exact match — `localhost:5000` 정렬 (push target 의 URL 과 동일).
  2. host 임시 디렉터리의 permission (mktemp default 0700) — `chmod 0755` 로 runner uid 1500 이 read 가능.
  3. registry:2 가 apr1 hash format 을 인식 안 함 — `httpd:alpine htpasswd -nbB` 로 통일, bcrypt ($2y$) 형식.
  4. KEEP_PROJECT=1 의 bind mount dangling source (debug 보강) — trap 의 `rm -rf` 도 보류, 운영자 manual cleanup 으로 debug 가능.
- 회귀 baseline (TASK-101 baseline 동기화): TS 5 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **143/143 동일** (backend 변경 0), build-monitor vitest **130/130 동일** (frontend 변경 0 — React baseline), Go 8 packages 모두 PASS (TASK-073 baseline 유지), svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, `e2e-registry-push.sh` **ALL PASS** (~3-4 분: httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push lifecycle ~30-60s + cleanup). catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags list 에 buildId 노출 + bonus 인증 부재/잘못된 credential 모두 401.

## 3.9 Credential rotation e2e (TASK-075)
- 의도: TASK-074 의 htpasswd 인증 환경에서 htpasswd + config.json 의 auths entry 를 runtime 중 갱신해도 docker CLI + registry 가 새 credential 로 push 동작함을 검증. 운영자가 rotate 시점에 알아야 할 두 가지 운영 규약도 정립: (a) htpasswd 갱신 후 registry container restart 필수, (b) htpasswd 와 config.json 둘이 어긋나면 즉시 unauthorized.
- 핵심 변경:
  - `apps/build-server/scripts/e2e-credential-rotation.sh` 신규 — 9 단계 + 보너스 2 (busybox/registry warm-up → 초기 credential v1 셋업 → compose up → registry healthy → build-server healthy → runner registered → 첫 build (v1) push 통과 → htpasswd v2 + config.json v2 갱신 → SIGHUP+restart fallback → 두 번째 build (v2) push 통과 → 옛 credential 401 → 새 credential catalog 정상 + 두 buildId tags 노출).
  - 사전 결함 + 보강 4건 동시 봉인 (운영 가이드 §5):
    1. htpasswd file 0444 read-only 가 갱신 시 Permission denied (silent fail 위험) → `update_htpasswd()` 가 `chmod 0644` 후 redirect + `chmod 0444` 재부착.
    2. `submit_and_wait()` 함수의 stdout 이 buildId 와 progress log 가 혼합 → log() helper + `>&2` redirect, stdout 에는 buildId 만.
    3. **registry:v2 가 htpasswd file 의 container-runtime 갱신을 즉시 반영 안 함** — SIGHUP 시도 → 안 되면 restart fallback. 운영 환경 credential rotation workflow 의 보안 결함(옛 credential 이 cache 기간 동안 동작) 명시화.
    4. v2 credential 갱신 후 옛 credential 의 즉시 무효화 → restart 후엔 즉시 401 보장 (htpasswd cache 가 새 file 로 reset).
  - `docs/operations/credential-rotation-2026-07-07.md` 운영 가이드 신규 (검증 결과 / 사용 절차 / 9 단계 매트릭스 / 사전 결함 4건 / 빠른 재현 / 운영 환경 credential rotation playbook).
- 회귀 baseline (TASK-101 baseline 동기화): TS 5 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **143/143 동일** (backend 변경 0), build-monitor vitest **130/130 동일** (frontend 변경 0 — React baseline), Go 8 packages 모두 PASS (TASK-074 baseline 유지), svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, `e2e-registry-push.sh` (TASK-074) **ALL PASS** (회귀 baseline 유지), `e2e-credential-rotation.sh` (TASK-075) **ALL PASS** (~3-4 분: httpd:alpine pull 20s + registry:2 cold start 5-10s + build-server healthcheck 30s + cli push v1 ~30s + htpasswd 갱신 + SIGHUP+restart ~10s + cli push v2 ~30s + cleanup). catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags list build_v1+build_v2 둘 다 노출 + bonus 옛 credential 401 + 새 credential 정상.

> ⚠ **TASK-074 / TASK-075 superseded by TASK-076 (insecure-registry-only)** — 사용자 결정 ("htpasswd 제외") 에 따라 TASK-076 가 htpasswd / REGISTRY_AUTH=htpasswd / credential rotation 을 모두 제외한 insecure-registry 운영 모델로 supersede. `e2e-registry-push.sh` (TASK-074) 와 `e2e-credential-rotation.sh` (TASK-075) 는 git history 에 보존되지만 운영 운영의 canonical 은 §3.10 의 `e2e-insecure-registry.sh`. 운영 가이드 §5 의 결함 발견 (registry:v2 htpasswd cache 즉시 reload 안 함) 이 본 TASK 의 motivation 이었지만, insecure-registry 모델에서는 htpasswd 자체가 없어 결함 자체도 회피됨.

## 3.10 Insecure-registry only 운영 패턴 (TASK-076)
- 의도: htpasswd / REGISTRY_AUTH=htpasswd / credential rotation 을 모두 제외하고 `registry:2` 의 anonymous access 모드만 운영 — internal network (VPC / k8s service mesh) 으로 외부 노출을 차단하고 권한 분리는 upstream access control (k8s RBAC / docker daemon ACL / network policy) 에서 처리. 이 모델이 운영 부담 0 / 단순함 / image lifecycle 단순화 의 장점으로 TASK-074/075 의 htpasswd 모델을 supersede.
- 핵심 변경:
  - `compose.dev.e2e-insecure-registry.yaml` 신규 — `REGISTRY_AUTH` env 미설정 (anonymous access) + `REGISTRY_STORAGE_DELETE_ENABLED=true` + `${HOST_REGISTRY_AUTH_DIR}` volume 제거 + htpasswd 인증 환경 일체 제거.
  - `apps/build-server/scripts/e2e-insecure-registry.sh` 신규 — 8 단계 + 보너스 (busybox/registry warm-up → HOST_REGISTRY_CONFIG 셋업 / insecure-registries 만, auths 없음 → compose up → registry healthy (`/v2/` 200 — anonymous access) → build-server healthy → runner registered → **5 build 동시 push** (per-build unique source archive — build_idx 가 Dockerfile 의 RUN line content 에 반영되어 manifest digest 가 build 별 unique) → image retention 검증 (catalog + tags list 노출 → DELETE API 로 1 tag 삭제 → 다른 4 tag 영향 없음 확인) → [bonus] retention 후 새 build push — storage 재사용).
  - `apps/build-server/scripts/e2e-registry-push.sh` (TASK-074), `e2e-credential-rotation.sh` (TASK-075) 삭제 — htpasswd 모델로 canonical 운영은 insecure-registry only 로 supersede. git history 에 보존.
  - `compose.dev.e2e-registry.yaml` (TASK-074) 삭제 — htpasswd 환경 전용. `compose.dev.e2e-insecure-registry.yaml` 가 supersede.
  - `docs/operations/registry-push-2026-07-07.md` (TASK-073) + `registry-push-auth-2026-07-07.md` (TASK-074) + `credential-rotation-2026-07-07.md` (TASK-075) 삭제 — htpasswd 모델 운영 가이드. `insecure-registry-only-2026-07-07.md` 가 supersede.
  - `docs/operations/insecure-registry-only-2026-07-07.md` 운영 가이드 신규 — internal network 격리 + image lifecycle 운영 패턴 (k8s Deployment + NetworkPolicy + CronJob 의 self-contained 검증).
- 사전 결함 + 보강 3건 (운영 가이드 §5):
  1. **동일 Dockerfile 의 5 build 가 manifest digest 가 동일 → 1 tag DELETE = 모든 tag 영향** (TASK-076 의 핵심 발견). 운영자가 같은 Dockerfile 의 build 5 개 push 후 가장 오래된 1 개를 retention 으로 지우면 가장 최근 4 개까지 영향 — 보존해야 할 build 들까지 사라지는 silent failure. 해결: e2e 가 build_idx 를 Dockerfile 의 RUN line 에 주입해 per-build unique source archive — 같은 busybox base image 라도 layer content 가 build 별 다름 → manifest digest unique → DELETE 가 target tag 한정. **운영 권고**: image 의 `LABEL build_id=$CI_COMMIT_SHA` 또는 build time 의 `RUN echo "Build: $(date +%s)"` 같은 unique content 보장.
  2. **curl `-I` (HEAD) 가 Docker-Content-Digest header 를 안 보냄** — registry:2 가 GET 요청에서만 digest header emit. 해결: `curl -sS -D - -o /dev/null` 패턴 — `-D -` 가 response header 를 stdout 으로 dump, `-o /dev/null` 가 body 는 discard.
  3. **submit_and_wait 의 per-build source archive 가 mktemp cleanup 으로 source archive 까지 삭제** — `per_src="$(mktemp -d)"` 후 `rm -rf "${per_src}"` 를 source archive 생성 직후에 호출 → upload 가 0 bytes. 해결: `rm -rf "${per_src}"` 를 upload / build lifecycle 완료 후로 이동.
- 회귀 baseline (TASK-101 baseline 동기화): TS 5 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **143/143 동일** (backend 변경 0), build-monitor vitest **130/130 동일** (frontend 변경 0 — React baseline), Go 8 packages 모두 PASS (TASK-075 baseline 유지), svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB**, `e2e-insecure-registry.sh` ALL PASS (~3-4 분: registry:2 cold start 5-10s + build-server healthcheck 30s + 5 build 동시 push ~30-60s + retention 검증 ~5s + cleanup). catalog `{"repositories":["docker-image-builder-system/cli"]}` + tags 5 buildId 다 노출 (per-build unique manifest digest) + DELETE 202 Accepted (target tag 만 삭제, 다른 4 tag 영향 없음) + retention 후 새 build push 통과.
- **Postgres backend 회귀 (TASK-102 baseline 양축 동기화)**: `e2e-insecure-registry.sh` 는 memory backend 의 anonymous registry 운영 검증 회귀 가드 — insecure-registry 운영 모델은 memory / postgres 두 backend 와 직교하므로 별도 postgres 회귀 가드 추가 불필요. 단, registry 연동을 Postgres backend (예: staging) 에서 운영하면 postgres migration `0001~0005` 적용 + `applyMigrations` 자동 부팅 정상 동작은 §3.5 의 e2e-source-archive-postgres / TASK-082 의 e2e-multi-runner-postgres 에서 보편적 검증. 후속 TASK 권장: insecure-registry + Postgres backend 의 e2e 가드 신규 (registry push 데이터 보존 검증).

## 3.11 Admin-initiated runner registration (TASK-077)
- 의도: TASK-069 의 self-register on first claim 은 runner 가 boot 되어 첫 `POST /builds/claim` 호출 시점에 비로소 admin registry 에 record 가 생성. 운영자가 신규 cluster / k8s pod / EC2 instance 에서 runner 를 띄우기 전 그 runner 가 곧 들어온다는 것을 admin UI 에 미리 알릴 수 없었음. 본 TASK 가 봉인하는 `POST /admin/runners` endpoint + admin UI 의 "+ Register Runner" 버튼이 그 gap 을 매움.
- 핵심 변경:
  - `packages/shared-contract/src/build/runner-registry.ts` amend — `adminRunnerRegisterRequestSchema` (runnerId 만, strict) + `adminRunnerRegisterResponseSchema` (adminRunnerSchema wrap). empty / extra field / type mismatch → 400 (strict schema).
  - `packages/db` schema 변경 없음 (기존 `runner` table 그대로 사용).
  - `apps/build-server/src/routes/admin-routes.ts` amend — `POST /admin/runners` endpoint 신규. 401 (X-Admin-Id missing) / 403 (non-admin) / 400 (invalid body) / 409 (duplicate) / 201 (created) 응답.
  - `apps/build-server/src/services/build-service.ts` amend — `createAdminRunner(runnerId)` method.
  - `apps/build-server/src/repositories/{memory,postgres}-build-repository.ts` amend — `createAdminRunner()` method (memory: `Map.has` check, postgres: `INSERT … ON CONFLICT DO NOTHING` — atomic). 반환 타입: `{ kind: "created"; runner }` / `{ kind: "duplicate" }`.
  - `apps/build-server/src/app/openapi.ts` amend — `AdminRunnerRegisterRequest` + `AdminRunnerRegisterResponse` component 등록 + POST path 등록 (201/400/401/403/409).
  - `apps/build-monitor/src/lib/api.ts` amend — `createAdminRunner(adminId, body)` helper + `AdminRunnerRegisterRequest/Response` type re-export.
  - `apps/build-monitor/src/components/RegisterRunnerModal.svelte` 신규 — runnerId input + Enter/Escape 키보드 / backdrop click → close. 성공시 (201) close + onSuccess, 실패 (400/401/403/409) 시 inline error 표시 + modal 유지.
  - `apps/build-monitor/src/routes/AdminRunners.svelte` amend — page-head 의 `page-head-actions` div 에 "+ Register Runner" 버튼 + `<RegisterRunnerModal bind:open={registerModalOpen} onSuccess={refresh} />`. submit 성공시 `refresh()` 호출.
- 사전 결함 + 보강 4건 (운영 가이드 §5):
  1. **strict schema 의 extra fields 거부** — zod `.strict()` 가 admin 의 typing 실수를 400 으로 거부. backend 가 새 field 를 받기 전 contract 정합성 보장.
  2. **self-register 와의 race condition 방지** — postgres `ON CONFLICT DO NOTHING` / memory `Map.has` 가 atomic. 어느 한 쪽이 success, 다른 한 쪽이 409.
  3. **admin UI 의 modal close vs error 표기 policy** — error 시 modal 닫지 않음 (재시도 가능). 성공시에만 close + refresh.
  4. **`runnerId` 가 `RUNNER_ID` env 와 일치해야 함** — modal 의 modal-help 가 명시. 운영자가 mismatch 를 사전에 알 수 있도록.
- 회귀 baseline (TASK-101 baseline 동기화): TS 5 packages `tsc --noEmit` clean (변경 파일 영향 없음), build-server node:test **131 → 143 PASS** (8건 신규: 401/403/400 empty/400 extra/201 created/409 duplicate/409 self-then-admin/200 list), build-monitor vitest **130/130 PASS** (5건 신규: button visible/modal opens/success refresh+close/409 modal open/400 modal open — React 측 modal 정합), Go 8 packages 모두 PASS (TASK-076 baseline 유지), svelte-check script 제거 (TASK-101 Svelte scaffold 일괄 정리), vite build:react 정상 — gzip js **99.01KB** / css **30.62KB** (TASK-101 baseline, RegisterRunnerModal 추가분 통합 완료), GitHub Actions `build + smoke` SUCCESS.
- **Postgres backend 회귀 (TASK-102 baseline 양축 동기화)**: `POST /admin/runners` 의 401/403/400 empty/400 extra/201 created/409 duplicate 응답은 memory backend 의 Map.has + postgres backend 의 `INSERT … ON CONFLICT DO NOTHING` 양쪽에서 동등 회귀 가드. §3.5 의 e2e-source-archive-postgres 의 `applyMigrations` 자동 부팅 + TASK-082 의 multi-runner 적재 + TASK-066 follow-up batch 3 의 Postgres default 개발 경로 권장 모두 정합. 운영자가 Postgres backend 의 admin UI 를 띄울 때 별도 회귀 가드 추가 불필요 — 모든 backend 공통 contract 가 동일하게 봉인.

## 4. 검증 포인트 (Validation)
- 코드 변경: 현재 단계에서는 해당 사항 없음. 구현 전에는 도메인 경계와 책임 분리가 문서로 먼저 확정되어야 함
- 문서 변경: README, `docs/sdlc/01-mvp-onboarding.md`, `docs/sdlc/02-concept-refinement.md`, `docs/sdlc/contracts/01-shared-build-contract-baseline.md`, handoff, backlog, state가 같은 현재 focus와 canonical 상태 모델을 가리켜야 함
- UI 변경: React 측 (TASK-088~101) — Svelte 측 src/ 일괄 폐기 (TASK-101). React 단일 SPA 운영 baseline: vitest **130/130 PASS**, vite build:react 정상 (gzip js 99.01KB / css 30.62KB), TS 5 packages `tsc --noEmit` clean. 디자인 토큰 단일화 (TASK-096.5) — Svelte `tokens.css` 가 단일 source-of-truth, React 측 `tokens.css` 사본. Astryx Theme 컴포넌트 보호용 `theme.css` 별도 layer 분리. **Postgres backend 운영 baseline (TASK-102 양축 동기화)**: 동일 baseline 이 memory / postgres 두 backend 에서 정합 — vitest 130 / build-server 143 / e2e-source-archive-postgres ALL PASS / TASK-082 multi-runner-postgres ALL PASS / `applyMigrations` 자동 부팅 정상. frontend 변경 0 이므로 React 측 운영 baseline 영향 없음.
- **v0.7.0+ 회귀 baseline**: Phase 3 완료 + 호스팅 status 캐시 봉인. frontend vitest **279 PASS** / build-server **205 PASS** (+ 6 hosting.status.sync) / TS 5 clean / migration **0001~0012** / 호스팅 e2e `e2e-hosting.sh` ALL PASS / 부팅 스모크(스케줄러+health) ALL PASS. `HostedService` API 호환 확장(2 nullable 필드 추가). **v0.8.0+ 회귀 baseline**: k8s adapter 운영 결함 3종(TASK-175) + v0.8.1 k8s e2e nightly + v0.8.3 release-checklist k8s 보강까지 누적. **불변** — frontend vitest 279 / build-server 205 / TS 5 clean / migration 0001~0012 / go 8 pkg. nightly `k8s-deploy-e2e` 잡은 `schedule(cron 04:00 UTC)` + `workflow_dispatch` 전용, 매 push 제외. **v0.8.13 회귀 baseline** (TASK-178 호스팅 e2e CI 운영 가이드 보강 + 13연속 운영 patch 정합): 코드 변경 0 / 운영 가이드 1종 신규(`docs/operations/hosting-e2e-ci-2026-07-27.md`, salp 라인 흡수) + 표준 ai-workflow 키트 session-end skill 신설 + 5 package.json `0.8.12`→`0.8.13` 통일. **불변** — frontend vitest 278(사전 환경 의존 1 fail v0.8.3 동일, 본 patch 무관) / build-server 205 / TS 5 clean / migration 0001~0012 / go 8 pkg / 호스팅 e2e ALL PASS. **workflow meta 정합 추가 가드**: 표준 키트 session-end 가드 5종(`ai-workflow/skills/session-end/`) 으로 종료 시점에 workflow meta drift 검출 — G1 state.json JSON / G2 current_baseline == HEAD tag / G3 rev 정합 / G4 latest_backlog_path / G5 5 package.json version 통일. pre-push hook helper (`scripts/pre-push-session-end.sh` + `.grok/hooks/install-pre-push.sh`) 로 push 시 drift 자동 차단 가능.
- **v0.8.14 회귀 baseline** (TASK-180 session-end pre-push hook helper + PROJECT_PROFILE baseline 정합 + CHANGELOG §26 표 v0.5.0→v0.8.13 확장): 코드 변경 0 / 운영 가드 2종 신규 (`scripts/pre-push-session-end.sh` workflow meta drift 검출 wrapper + `.grok/hooks/install-pre-push.sh` `.git/hooks/pre-push` 설치 helper, ALLOW_FORCE / REMOVE 모드). PROJECT_PROFILE.md §2 운영 가이드 인덱스 4종→5종 + §3 hosting-e2e CI 운영 가이드 + workflow meta drift 가드 + §4 검증 포인트 v0.8.13 baseline 단락. CHANGELOG.md §26 표 v0.5.0 단일 row → v0.6.0/v0.7.0/v0.8.0/v0.8.13 row 4 추가 + 운영 가드 행 + 5 package.json version 행. 5 package.json `0.8.13`→`0.8.14` 통일. **불변** — frontend vitest 278 (동일 baseline) / build-server 205 / TS 5 clean / migration 0001~0012 / go 8 pkg. workflow / 스크립트 / SQL / schema / migration 변경 0. session-end 가드 read-only 실행 시 G2/G3 drift 검출 (G1/G4/G5 PASS) — drift의 push 시점 차단 가능.
- **v0.8.15 회귀 baseline** (TASK-181 G3 drift 근본 원인 해소 + meta 정합): **코드 변경 0**. session_handoff.md 의 historical `## 핵심 (rev N)` 헤더 6종을 `## §핵심 (historical, rev N)` 라벨로 변경 (본문 보존), 가드의 패턴 1 매칭이 깨지면서 G3 정상화. state.json schema 위치 단일화 (`source_of_truth.latest_backlog_path` 제거, `backlog.latest_backlog_path` 단일 유지). CHANGELOG §26 표 v0.8.14 row 추가. PROJECT_PROFILE §4 baseline 표 v0.8.14 row 추가. 5 package.json `0.8.14`→`0.8.15` 통일. **불변** — frontend vitest 278 (동일 baseline) / build-server 205 / TS 5 clean / migration 0001~0012 / go 8 pkg. **session-end 가드 5/5 PASS** (G2 drift는 본 release commit 시점 first 줄 갱신으로 해소). workflow / 스크립트 / SQL / schema / migration 변경 0.
- **v0.8.16 회귀 baseline** (TASK-182 session-end 가드 9종 확장 G6~G9 신설 + CHANGELOG §26 표 v0.8.15/v0.8.16 row 추가): **코드 변경 0**. 표준 ai-workflow 키트 session-end skill 의 가드 5종을 **9종으로 확장**. G6 `current_baseline` ↔ CHANGELOG.md latest release 정합 / G7 HEAD commit subject 정합 (release commit 의 vX.Y.Z ↔ handoff_rev 의 G3 잔존 검출) / G8 session_handoff.md 첫 줄 `- Updated:` 헤더 ↔ CHANGELOG.md latest release 정합 / G9 state.json semantic 검증 (필수 필드 / 타입 / `latest_backlog_path` 2중복 단일화 정합). 적용 후 2/9 fail 검출 (G2 current_baseline drift + G8 session_handoff 첫 줄 ↔ CHANGELOG drift — 본 release commit 시점에 모두 해소). CHANGELOG.md §26 회귀 baseline 표 v0.8.15 row + v0.8.16 row 추가 (총 14 컬럼, 운영 가드 행에 `session-end 9종 가드` 추가, workflow meta 정합 행에 `session-end 가드 9종` 추가). 5 package.json `0.8.15`→`0.8.16` 통일. **불변** — frontend vitest 278 (동일 baseline) / build-server 205 / TS 5 clean / migration 0001~0012 / go 8 pkg. **session-end 가드 9/9 PASS** (release commit 후). workflow / 스크립트 / SQL / schema / migration 변경 0.
- **v0.9.0 release baseline (2026-08-04)**: 5개 배포 package(`packages/shared-contract`, `packages/shared-config`, `packages/db`, `apps/build-server`, `apps/build-monitor`) version `0.9.0` 통일. frontend Vitest **282/282 PASS**, build-server node:test **205/205 PASS**, TS `--noEmit` clean, runner Go **8 packages PASS**. Helm kind e2e, hosted HTTP kind e2e, ArgoCD kind e2e 모두 PASS. DB/API contract 및 migration 변경은 없음. 상세 검증표와 rollback 기준은 [`RELEASE_NOTES-v0.9.0-2026-08-04.md`](../RELEASE_NOTES-v0.9.0-2026-08-04.md)와 [`CHANGELOG.md`](../CHANGELOG.md)를 따른다.
- 배포/운영: Docker 실행 권한, 테스트 runtime 노출 정책, 컨테이너 수명 정책, 외부 배포 경로가 문서로 합의되기 전에는 운영 판단 금지

## 5. 예외 규칙 (Policy)
- 병합: 현재 단계에서는 구현보다 컨셉 문서 정합성을 우선한다
- 승인: Docker 보안 정책, registry 연동, 테스트 runtime 노출 정책, 외부 배포 대상 정책은 운영자 승인 필요
- 제약: Postgres smoke는 통과했지만 Drizzle migration artifact 생성/운영 규칙은 아직 고정되지 않았다
- 기타: 현재 다음 단계는 postgres 경로를 기본 개발 경로로 승격할지 결정하고, `Runner -> Host Server API only`, `Host Server -> PostgreSQL only` 경계 위에서 Runner 연동으로 넘어가는 것이다

> **TASK-101 baseline 추가 (2026-07-18)**: React 단일 SPA 운영 — Svelte 측 src/ 일괄 폐기 (TASK-101) + frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~101) + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE.md React baseline 동기화 (PR #57) 까지 17 TASK 연속 봉인 완료. 운영 baseline: vitest **130/130 PASS**, vite build:react 정상 (gzip js **99.01KB** / css **30.62KB**), build-server node:test **143/143 PASS**, Go 7+ packages 모두 PASS. Svelte 측 의존성 (`svelte` / `svelte-spa-router` / `svelte-check` / `@sveltejs/vite-plugin-svelte` / `@testing-library/svelte` / `@tsconfig/svelte`) 일괄 폐기. `apps/build-monitor/src/` 디렉터리 일괄 폐기.

## 3.12 React 빌드 mount 운영 패턴 (TASK-093 + TASK-094 + TASK-100 + TASK-101)
- 의도: TASK-075 의 단일 포트 reverse proxy 위에서 Svelte 빌드를 React 빌드로 swap (TASK-093) + Svelte legacy mount 제거 (TASK-094) + App.svelte router 단순화 (TASK-100) + Svelte scaffold 일괄 정리 (TASK-101). frontend rewrite 7-PR 시리즈 + M4.5 8-PR 시리즈 후의 React 단일 SPA 운영 패턴. **React 빌드(`apps/build-monitor/dist-react/`) 만 primary SPA** — `/` + `/assets/*` + `/favicon.svg` + SPA fallback. **Svelte 빌드는 일괄 폐기** (TASK-101).
- 핵심 변경:
  - `apps/build-server/src/app/create-app.ts` `mountBuildMonitorDist` — React `@fastify/static` (decorateReply: true) 만 mount. SPA fallback: 그 외 unknown path → React index.html (`fs.createReadStream` raw stream). `BUILD_MONITOR_DIST_PATH` (Svelte) env + `mountSvelteIndexHtml` helper + `/svelte/*` SPA fallback 모두 삭제 (TASK-094). React 빌드 mount 만 활성.
  - env 단일: `BUILD_MONITOR_REACT_DIST_PATH` (default `apps/build-monitor/dist-react`).
  - `apps/build-monitor/src/` 디렉터리 일괄 폐기 (TASK-101) — App.svelte + components 8 + lib 7 + routes 16 + test 2 + main.ts. Svelte 측 App.svelte 의 routes 정의는 TASK-100 에서 `*` (NotFound) 1개로 단순화 후 TASK-101 에서 App.svelte 자체 일괄 폐기. Svelte 측 entrypoint (`main.ts`) + `tokens.css` + `theme.css` 도 일괄 폐기. React 측 `tokens.css` 가 단일 source-of-truth (TASK-096.5 디자인 토큰 단일화).
  - React 측 `App.tsx` 가 모든 route 의 단일 진입점. react-router-dom v7 `<Routes>` + `<Route>` 매핑 (`/` → `/login` replace, `/login`, `/builds`, `/builds/:buildId`, `/build-request`, `/api-console`, `/admin/{builds,users,admins,runners}`, `*` → `/login` replace). 모든 route 가 React 측 `Header` 공유. TASK-088~101 까지 frontend rewrite + M4.5 8-PR 시리즈 + 디자인 토큰 단일화 + Svelte scaffold 정리.
- 운영 명령 (Build Server 단일 port, React 단일 SPA):
  ```bash
  # 1) React 빌드 생성 (TASK-101: Svelte 빌드 폐기 — React 만 운영)
  (cd apps/build-monitor && ./node_modules/.bin/vite build --config vite.react.config.ts)

  # 2) Build Server 부팅 (React dist 검증 + 두 backend 옵션)
  ./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
    ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json

  # 2-a) memory backend (단일 runner / 단일 build / 빠른 smoke — dev 보조 경로)
  BUILD_REPOSITORY_BACKEND=memory \
    node apps/build-server/dist/apps/build-server/src/index.js

  # 2-b) Postgres backend (default 개발 경로 — 운영 환경은 Postgres 만 사용.
  #     DATABASE_URL 의 postgres container 가 127.0.0.1:15432 에 떠 있어야 하고,
  #     DB_AUTO_BOOTSTRAP=true 로 ensureDbSchema + applyMigrations 자동 부팅.
  #     자세한 운영 권장은 §3.2 + docs/operations/source-archive-postgres-2026-07-18.md 참조)
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
    BUILD_REPOSITORY_BACKEND=postgres \
    DB_AUTO_BOOTSTRAP=true \
    node apps/build-server/dist/apps/build-server/src/index.js
  ```
  그 다음 한 port 에서:
  - `curl http://127.0.0.1:3000/` → React index.html (primary SPA)
  - `curl http://127.0.0.1:3000/admin/builds` → React index.html (SPA fallback, `/admin/*` deep link)
  - `curl http://127.0.0.1:3000/api/builds` → Build Server API (307 transparent redirect)
  - `curl http://127.0.0.1:3000/builds/<uuid>` → Build Server 의 `GET /builds/:buildId` route (UUID validation 통과 시 200 JSON; non-uuid 입력 시 500 zod validation)
- 사전 결함 + 보강:
  - `mountBuildMonitorDist` 가 React 만 mount — `@fastify/static` decorateReply decorator 충돌 회피 단순화.
  - `/builds/<id>` direct URL 입력 → Build Server 의 wildcard GET route 가 UUID validation 으로 거절 (500). 운영자는 React BuildDetail 진입은 `/api/builds/<id>` (Build Server 가 응답) 또는 `<Link>` 클릭 사용. 정직한 동작.
- 회귀 baseline: TS 5 packages `tsc --noEmit` clean, build-server node:test **131 → 143 PASS** (TASK-075 baseline 131 + TASK-093 신규 12 + TASK-101 Svelte scaffold 정리 영향 0), build-monitor vitest **130/130 PASS** (TASK-101 Svelte 135 case 일괄 삭제), Go 7 packages 모두 PASS. svelte-check script 제거 (TASK-101 Svelte scaffold 정리).
- **Postgres backend 회귀 (TASK-102 baseline 양축 동기화)**: Build Server 의 `mountBuildMonitorDist` + SPA fallback + `/api/*` 307 redirect + JSON 404 + POST/PATCH/DELETE bypass 는 memory / postgres 두 backend 와 직교 — backend 선정과 무관하게 동일하게 통과. React 단일 SPA 운영 baseline 은 Postgres 환경 (Prod / Staging) 의 default 운영 패턴에서도 유지. 단일 port reverse proxy 의 `/health` + `/openapi.json` 응답은 backend 가 memory / postgres 어느 쪽이든 동일 — backend 차이로 frontend mount 동작에 영향 없음. 운영 검증은 §3.5 의 e2e-source-archive-postgres.sh + TASK-082 의 e2e-multi-runner-postgres.sh 모두 ALL PASS 로 확인.

## 다음에 읽을 문서
- [세션 인계 문서](../ai-workflow/memory/active/session_handoff.md)
- [작업 백로그](../ai-workflow/memory/active/work_backlog.md)
- TASK-096.5 디자인 토큰 단일화 운영 가이드: [design-tokens-unification-2026-07-18.md](operations/design-tokens-unification-2026-07-18.md)
- TASK-099 BuildRequest + ApiConsole React 운영 가이드: [build-request-api-console-react-2026-07-18.md](operations/build-request-api-console-react-2026-07-18.md)
- TASK-100 App.svelte router 단순화 운영 가이드: [app-router-simplify-2026-07-18.md](operations/app-router-simplify-2026-07-18.md)
- TASK-101 Svelte scaffold 일괄 정리 운영 가이드: [svelte-scaffold-cleanup-2026-07-18.md](operations/svelte-scaffold-cleanup-2026-07-18.md)
- TASK-101 follow-up PROJECT_PROFILE React baseline 동기화 운영 가이드: [project-profile-react-baseline-2026-07-18.md](operations/project-profile-react-baseline-2026-07-18.md)
- TASK-101 follow-up batch 2 PROJECT_PROFILE React baseline full sync 운영 가이드: [project-profile-react-baseline-full-sync-2026-07-18.md](operations/project-profile-react-baseline-full-sync-2026-07-18.md)
- TASK-066 follow-up batch 3 source archive Postgres 운영 가이드: [source-archive-postgres-2026-07-18.md](operations/source-archive-postgres-2026-07-18.md)
- TASK-102 PROJECT_PROFILE §3 baseline 양축 동기화 운영 가이드: [project-profile-baseline-postgres-sync-2026-07-20.md](operations/project-profile-baseline-postgres-sync-2026-07-20.md)
- TASK-103 migration CLI 운영 workflow 운영 가이드: [migration-cli-workflow-2026-07-20.md](operations/migration-cli-workflow-2026-07-20.md)
- TASK-104 build_source TOAST 전략 운영 가이드: [build-source-toast-strategy-2026-07-20.md](operations/build-source-toast-strategy-2026-07-20.md)
- TASK-105 운영 배포 체크리스트 운영 가이드: [release-checklist-2026-07-20.md](operations/release-checklist-2026-07-20.md)
- TASK-106 source archive chunked upload 운영 가이드: [source-archive-chunked-2026-07-20.md](operations/source-archive-chunked-2026-07-20.md)
- TASK-066 follow-up batch 4 (RFC 7233 Content-Range 호환 wire-format) — 후속 TASK 권장: `bepis-lab/rfc-7233` 의 의미론을 chunked upload 에 적용. 본 TASK-107 의 PROJECT_PROFILE.md §3 source archive 라운드트립 부분에 의미 A/B/C 3 종 + 권장 의미 C 의 분리 결정 정리. 후속 TASK 에서 신규 운영 가이드 / 신규 회귀 가드 (RFC 7233 wire-format 4 case) / route layer 의 wire-format 처리 amend 예정. SQL / schema / migration 변경 0 — wire-format 만 amend.
- TASK-108 Content-Range RFC 7233 chunked wire-format 의미 C bipartite 운영 가이드: [content-range-rfc-7233-2026-07-20.md](operations/content-range-rfc-7233-2026-07-20.md)
- TASK-109 Content-Range RFC 7233 §4.2 `*` 케이스 후속 봉인 운영 가이드: [content-range-rfc-7233-star-2026-07-20.md](operations/content-range-rfc-7233-star-2026-07-20.md)
- TASK-110 Content-Range RFC 7233 strict 모드 env flag 운영 가이드: [content-range-rfc-7233-strict-mode-2026-07-20.md](operations/content-range-rfc-7233-strict-mode-2026-07-20.md)
- TASK-111 Production-semantic Postgres 운영 가이드: [production-semantic-postgres-2026-07-20.md](operations/production-semantic-postgres-2026-07-20.md)
- TASK-085 Production-semantic (memory variant) 운영 가이드 — TASK-112 (양 variant 운영 가이드 cross-reference): [production-semantic-2026-07-07.md](operations/production-semantic-2026-07-07.md)
- TASK-113 Multi-runner Chunked Postgres 운영 가이드: [multi-runner-chunked-postgres-2026-07-20.md](operations/multi-runner-chunked-postgres-2026-07-20.md)
- [CHANGELOG.md](../CHANGELOG.md) (TASK-123 v0.1.0 release staging anchor)
- [v0.9.0 release notes](RELEASE_NOTES-v0.9.0-2026-08-04.md) (Helm/ArgoCD adapter + 실 e2e)
- [Helm/ArgoCD e2e scripts](../apps/runner/scripts/e2e-helm-deploy.sh) / [`e2e-argocd-deploy.sh`](../apps/runner/scripts/e2e-argocd-deploy.sh)
- TASK-131 문서 무결성 가드 운영 가이드: [doc-integrity-guard-2026-07-21.md](operations/doc-integrity-guard-2026-07-21.md)
- TASK-133 테마별 시각 회귀 가드 운영 가이드: [theme-contrast-guard-2026-07-21.md](operations/theme-contrast-guard-2026-07-21.md)
