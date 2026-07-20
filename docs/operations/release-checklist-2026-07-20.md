# 운영 배포 체크리스트 (TASK-105)

- 작성일: 2026-07-20
- TASK: TASK-105 — 운영 배포 체크리스트 운영 가이드 (main HEAD `7b9d6ef` 의 운영 안정화)
- 시리즈: TASK-102 / TASK-103 / TASK-104 (docs only 정합) 후속 운영 안정화. 본 TASK 도 docs only.

## 의도

2026-07-08 ~ 2026-07-20 동안 frontend rewrite 7-PR 시리즈 (TASK-088~094) + M4.5 8-PR 시리즈 (TASK-095~098 + TASK-099 + TASK-100 + TASK-101) + 디자인 토큰 단일화 (TASK-096.5) + PROJECT_PROFILE React baseline batch 1 + batch 2 + TASK-066 follow-up batch 3 + TASK-102 + TASK-103 + TASK-104 까지 **22 TASK 연속 봉인**. main HEAD `7b9d6ef` 는 운영 영향 0 (모든 변경이 docs only 또는 cross-framework dead code 폐기 또는 운영 가이드 신규) 이며 회귀 baseline 정합.

다만, 운영자가 신규 build-server / runner / build-monitor 배포 시 체크리스트가 될 운영 가이드가 비어있는 상태. README / docs / operations 의 어떤 가이드에도 "운영 배포 단계별 절차" 가 정립되어 있지 않음 (operations 의 22 종 가이드는 모두 단일 TASK 운영 보강).

본 TASK 가 운영 배포 체크리스트를 단일 운영 가이드로 정립. 회귀 영향 0 — docs only.

## 결정

**옵션 A (채택)** — 운영 배포 체크리스트 운영 가이드. SQL / schema / migration 변경 없음. 신규 운영 가이드 본 문서 + PROJECT_PROFILE.md §3 끝 참조 항목 + 다음에 읽을 문서 reference.

> 본 TASK 는 **release notes / CHANGELOG 신규 (옵션 B) 또는 git tag v0.1.0 + version bump (옵션 C) 를 봉인하지 않습니다**. 운영 배포 체크리스트만 정립 — 운영자가 본 운영 가이드를 따라가며 배포 후 자연스럽게 release notes / version 관리의 필요성을 다시 평가할 수 있게 함.

## 운영 배포 체크리스트 (8 섹션)

### 1) Pre-deploy (배포 전)

본 단계는 운영자가 신규 commit (또는 commit 묶음) 을 운영 환경에 적용하기 직전의 점검 단계.

```bash
# 1. main HEAD 의 health check + state 동기성 확인
git log --oneline -n 5                              # main HEAD + 직전 4 commit 의 의도 / 영향 문서 검토
git status                                          # clean 상태인지
git diff main..origin/main                          # origin 과 정합

# 2. workflow meta 동기성 점검
python3 -c "import json; s=json.load(open('ai-workflow/memory/active/state.json')); print(s['purpose_digest_rev'], s['current_focus'])"
# → state.json 의 purpose_digest_rev + current_focus 가 "현재 봉인된 TASK" 와 정합

# 3. PROJECT_PROFILE.md §3 명령 박스 의 본 운영 가이드 reference 확인
grep "release-checklist" docs/PROJECT_PROFILE.md
# → 운영 가이드 reference 1 줄 노출되면 정상

# 4. 회귀 baseline sanity check — 모든 신규 운영 가이드 §6 follow-up 본 TASK 와 본 운영 환경 일치
./node_modules/.bin/tsc -p packages/shared-contract/tsconfig.json --noEmit && \
  ./node_modules/.bin/tsc -p packages/shared-config/tsconfig.json --noEmit && \
  ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit && \
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json --noEmit && \
  (cd apps/runner && go build ./...)
# → 모두 0 exit, 변경 0 — 운영 환경 / 신규 commit 이 같은 baseline

# 5. postgres migration 신규 검증
DATABASE_URL=postgres://staging-***:***@***/staging \
  scripts/db-migrate.sh --plan
# → staging DB 에 적용 계획만 확인 (실제 SQL 미실행)
```

체크리스트 (Pre-deploy):

- [ ] main HEAD 와 origin/main 정합 (git status clean)
- [ ] workflow meta 의 `purpose_digest_rev` / `current_focus` / 직전 commit 의 의도 본문 검토 완료
- [ ] 회귀 baseline 의 4 종 명령 (TS / Go / vite build / postgres migration plan) 0 exit
- [ ] postgres migration 신규 검증 dry-run ALL PASS
- [ ] 운영 환경에 적용할 신규 운영 가이드의 영향 / 회귀 baseline 본문 검토 완료
- [ ] 운영자 본인이 신규 commit 들의 의도를 충분히 이해 (PR description / 운영 가이드 / state.json 3 종 source cross-check)

### 2) Deploy (배포)

본 단계는 운영 환경의 build-server / runner / build-monitor 컨테이너 (또는 Node process) 를 신규 commit 의 artifact 로 교체.

```bash
# 1. build-server / runner / build-monitor 빌드 (workspace root 기준)
./node_modules/.bin/tsc -p packages/{shared-contract,shared-config,db}/tsconfig.json && \
  ./node_modules/.bin/tsc -p apps/build-server/tsconfig.json && \
  (cd apps/build-monitor && ./node_modules/.bin/vite build --config vite.react.config.ts) && \
  (cd apps/runner && go build -o ./bin/runner ./cmd/runner)

# 2. 운영 환경 배포
docker compose -f compose.dev.yaml up -d --build          # docker-compose 운영
# 또는 kubectl set image 또는 k8s deployment patch — 운영자 인프라에 따라 선택

# 3. migrate.ts 자동 부팅 — build-server 가 부팅 시 schema_migrations 의 미적용 SQL 자동 적용
docker compose logs -f build-server 2>&1 | grep -E "applyMigrations|migrations|0001|0002|0003|0004|0005|0006"
# → 신규 migration 이 자동 적용되고 logs 에 반영 (TASK-082 의 import.meta.url 함정 봉인 후 동일)
```

체크리스트 (Deploy):

- [ ] build-server 4 패키지 TS 컴파일 + Go build + Vite build 정상 (0 exit)
- [ ] compose / k8s 배포가 신규 artifact 로 교체 + image tag 가 main HEAD commit SHA 와 정합
- [ ] build-server 부팅 시 `applyMigrations` 가 신규 migration 정상 적용 (logs 에 applied list 노출)
- [ ] frontend 의 `dist-react/` 가 신규 vite build 산출물과 정합

### 3) Verify (검증)

본 단계는 운영 환경 부팅 직후 회귀 baseline 의 5 종 가드를 모두 통과해야 함.

```bash
# 1. health check
curl -fsS http://127.0.0.1:3000/health
# → {"ok":true,"service":"build-server"} (운영 환경 host 에 따라 조정)

# 2. OpenAPI 회귀 가드
curl -fsS http://127.0.0.1:3000/openapi.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('paths:', len(d.get('paths', {})), 'components:', len(d.get('components',{}).get('schemas',{})))"
# → 신규 commit 의 OpenAPI 검증 (TASK-038 ~ TASK-055 봉인 후 동일 — paths / components.schemas 수치 동일)

# 3. React 단일 SPA mount 검증
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/admin/builds
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/builds
# → / (React index.html 200) + /admin/* (SPA fallback 200) + /api/builds (Build Server API 307 transparent redirect)

# 4. postgres backend 회귀 가드
bash apps/build-server/scripts/e2e-source-archive-postgres.sh
bash apps/build-server/scripts/e2e-multi-runner-postgres.sh
# → 두 e2e ALL PASS — TASK-066 / TASK-082 봉인 baseline

# 5. memory backend 회귀 가드 (운영 환경 보조 검증 — 단일 runner / 빠른 smoke)
bash apps/build-server/scripts/e2e-production-semantic.sh
# → ALL PASS (약 2 분) — TASK-085 의 7 단계 운영 검증

# 6. 단일 port reverse proxy 검증 (TASK-075)
bash apps/build-server/scripts/e2e-single-port.sh
# → ALL PASS — React SPA + API 한 port 동시 노출

# 7. postgres migration 운영 가드 (TASK-103 신규 권고 스크립트)
DATABASE_URL=postgres://prod-***:***@***/prod \
  scripts/db-migrate.sh --status
# → ALL applied, no pending — 신규 commit 의 migration 이 모두 적용된 상태
```

체크리스트 (Verify):

- [ ] `/health` 200 + body 정합 (ok: true)
- [ ] `/openapi.json` paths / components 수치 baseline 정합
- [ ] React SPA `/` + `/admin/*` + `/api/builds` 3 종 응답 정합
- [ ] `e2e-source-archive-postgres.sh` ALL PASS
- [ ] `e2e-multi-runner-postgres.sh` ALL PASS
- [ ] `e2e-production-semantic.sh` ALL PASS (memory baseline)
- [ ] `e2e-single-port.sh` ALL PASS
- [ ] `scripts/db-migrate.sh --status` no pending

### 4) Post-deploy Monitoring (배포 후 모니터링)

본 단계는 운영자가 신규 build 가 운영 환경에서 정상적으로 claim / build / deploy cycle 을 도는지 운영 후 첫 24 시간 동안 모니터.

```bash
# 운영 환경에서 dashboard / log stream 모니터링
# 1. build queue 의적 build (skill 이 submit 한 신규 build) 가 claim 됨
DATABASE_URL=postgres://prod-***:***@***/prod \
  psql -c "SELECT lifecycle_status, COUNT(*) FROM build_request GROUP BY lifecycle_status;"

# 2. build phase 가 정상 transition (QUEUED → CLAIMED → BUILDING → TESTING → DEPLOYMENT_COMPLETED)
# → Build Server 의 GET /builds/:id 응답의 lifecycle block 정합

# 3. runner 가 build_state ACTIVE status 정합 (TASK-069 / TASK-077 의 RunnerStatus)
DATABASE_URL=postgres://prod-***:***@***/prod \
  psql -c "SELECT status, COUNT(*) FROM runner GROUP BY status;"

# 4. source archive upload + bytea round-trip 정상 (TASK-066 follow-up batch 3 의 e2e-source-archive-postgres 패턴)
# → 신규 source archive 가 upload 시 정상 bytea column 에 저장, GET 도 round-trip 정합
```

체크리스트 (Post-deploy Monitoring):

- [ ] 신규 build 가 운영 환경에서 정상 lifecycle (QUEUED → ... → terminal) 종결
- [ ] runner 의 ACTIVE status 정상 (TASK-077 의 admin-initiated 등록 + runner 의 heartbeat)
- [ ] source archive 의 bytea round-trip 정상 (psql direct verify)
- [ ] 운영자 측 alerts / dashboards 정합 (운영 환경 모니터링 시스템에 따라)
- [ ] 24 시간 내 신규 build 중 FAILED 비율이 baseline 대비 +5% 초과하면 즉시 rollback 검토 (§5 참조)

### 5) DR / Rollback 절차

본 단계는 신규 commit 의 회귀 baseline 정합이 깨졌을 때 운영자가 안전하게 직전 commit 으로 되돌리는 절차.

```bash
# 1. 운영 환경의 신규 commit 직전 commit 확인
git log --oneline -n 10

# 2. 직전 commit 으로 checkout (또는 image tag 를 직전 commit 으로 변경)
git checkout <PREV-COMMIT-SHA>

# 3. 운영 환경 재부팅
docker compose -f compose.dev.yaml up -d --build
# 또는 kubectl rollout undo deployment/build-server

# 4. 회귀 baseline 재검증 (Verify §3 의 7 종 가드 반복)
# → ALL PASS 시 운영 복귀

# 5. workflow meta sync — workflow meta 파일은 main HEAD 의 source-of-truth 와 정합이어야 함
git checkout main
# → 운영 환경은 직전 commit 사용, repo 작업 트리는 main 정합. 후속 결정 (roll-forward vs 추가 fix) 사용자 결정
```

체크리스트 (Rollback):

- [ ] 직전 commit 의 build-server 4 패키지 TS 컴파일 + Go build + Vite build 정상
- [ ] 운영 환경 부팅 후 `applyMigrations` 가 신규 migration 의 reverse DDL (또는 안전하게 skip) 정상 동작 — 신규 migration 이 schema destructive 면 별도 `psql` rollback SQL 작성 필요
- [ ] 회귀 baseline 재검증 ALL PASS
- [ ] 운영 환경 dashboard / log stream / alerts 정합

### 6) Operational Safety (운영 안전장치)

본 TASK 는 운영 안정화 workflows 의 봉인 의도이므로, 운영자가 알아야 할 안전장치도 정리.

1. **workflow meta sync 의 표준화** — 본 운영 가이드 §1 Pre-deploy 의 §2 (workflow meta 동기성 점검) 와 정합. 운영자가 workflow meta 의 `state.json` `purpose_digest_rev` / `current_focus` / 직전 commit 의 의도 본문을 cross-check 하지 않으면 §3 Verify 의 e2e 가드가 운영 환경과 신규 commit 사이의 misalignment 를 깨닫지 못함.
2. **신규 운영 가이드들의 cross-reference** — 본 운영 가이드는 단일 entrypoint. 운영자가 특수한 시나리오 (예: registry push / source archive / migration) 를 직면하면 §7 의 관련 문서 (operations/ 의 22 종 운영 가이드) 를 직접 참조. 본 운영 가이드가 특수 시나리오의 직접 절차를 포함하지 않음.
3. **DR / rollback 의 안전장치** — §5 의 절차가 destructive 한 운영 상황에서만 사용. 신규 commit 의 migrations 가 schema destructive 일 때 (예: column drop / table drop) 별도 `psql` rollback SQL 작성 필수. 신규 commit 의 migration 은 TASK-064 + TASK-082 의 `applyMigrations` idempotent 패턴으로 작성 — 운영 환경 기준 신규 commit 의 schema migration 모두 idempotent 해야 안전한 rollback 가능.
4. **운영 환경 baseline 의 drift** — 운영 환경에 신규 commit 적용 시 §3 Verify 의 회귀 가드 7 종 + §4 Post-deploy Monitoring 의 24 시간 모니터링 + §5 의 DR 절차가 본 운영 가이드의 봉인 의도. 운영자 측에서 본 가이드를 skip 하면 drift 가 누적되며 본 운영 가이드가 무의미.

### 7) 운영 환경 baseline 갱신 (후속 TASK 권장)

본 TASK 는 운영 환경의 신규 baseline 을 정의하지 않음 — 운영자는 본 운영 가이드를 따르면서 운영 환경의 신규 baseline 을 자연스럽게 발견. 본 TASK 후속 결정 후보:

- **Release notes / CHANGELOG 신규** (옵션 B) — 운영자가 §3 Verify + §4 Post-deploy 의 결과를 release notes 로 한 자리에 누적. 후속 TASK 권장.
- **git tag + version bump** (옵션 C) — 운영자가 release version 을 운영 환경의 commit SHA 에 tag + package.json version 동기화. 후속 TASK 권장.
- **운영 환경 monitors / alerts 자동화** — 본 TASK 가 §4 의 운영 monitors 를 수동 점검으로 노출. 자동화는 운영 환경 monitoring 시스템에 따라 별도 TASK.

### 8) follow-up

- **Release notes / CHANGELOG 신규** — 본 운영 가이드 운영 후 자연스러운 후속 결정 (운영자가 release version 노트 누적을 발견하면 옵션 B 권장).
- **git tag + version bump** — 운영자가 release version 의 tagged commit 을 운영 환경과 동기화할 필요 발견 시 옵션 C 권장.
- **운영 환경 monitors / alerts 자동화** — 운영자가 §4 Post-deploy Monitoring 의 수동 점검을 자동화하면 별도 TASK.

## 관련 문서

- `docs/PROJECT_PROFILE.md` §3 / §3.2 / 다음에 읽을 문서 (본 운영 가이드의 본 TASK 의 본 변경 표면)
- `docs/operations/source-archive-postgres-2026-07-18.md` (TASK-066 follow-up batch 3)
- `docs/operations/migration-cli-workflow-2026-07-20.md` (TASK-103)
- `docs/operations/build-source-toast-strategy-2026-07-20.md` (TASK-104)
- `docs/operations/project-profile-baseline-postgres-sync-2026-07-20.md` (TASK-102)
- `docs/operations/smoke-and-migration.md` (TASK-064)
- `docs/operations/production-semantic-2026-07-07.md` (TASK-085)
- `docs/operations/multi-runner-claim-postgres-2026-07-06.md` (TASK-082)
- `docs/operations/insecure-registry-only-2026-07-07.md` (TASK-076)
- `docs/operations/container-self-dogfood.md` (TASK-078)
- `apps/build-server/scripts/e2e-source-archive-postgres.sh` / `e2e-multi-runner-postgres.sh` / `e2e-production-semantic.sh` / `e2e-single-port.sh` (회귀 가드 4 종)
- `scripts/db-migrate.sh` (TASK-103 권고 스크립트)
- `scripts/smoke.sh` (TASK-064)
