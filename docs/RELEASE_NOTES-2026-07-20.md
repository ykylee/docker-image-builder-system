# RELEASE_NOTES 2026-07-20 — 본 세션 종합 리뷰

- 작성일: 2026-07-20
- 스크립트: TASK-114 — 본 세션 (2026-07-20) 의 12 TASK 종합 리뷰 + release staging 운영 가이드 + 결정 항목 인덱스.
- 시리즈: TASK-102 ~ TASK-113 본 세션의 종합 release notes.

## 1. 본 세션의 의도

본 세션은 **2026-07-08 ~ 2026-07-18 의 frontend rewrite 7-PR + M4.5 8-PR + 디자인 토큰 단일화 + PROJECT_PROFILE batch 1/2 + TASK-066 follow-up batch 3** 까지의 19 TASK 연속 봉인이 끝난 직후 운영자가 별도 결정 항목 (`TASK-066 follow-up` 의 결정 대기 후보 4 종) 을 정리하기 위해 신규 작업 흐름을 열었습니다. 본 세션의 결과는 운영자가 **운영 안정화 (release workflow + CHANGELOG + 운영 배포 체크리스트) + source archive scale-out (chunked split + RFC 7233 + multi-runner) + 운영 가이드 인덱스화** 의 3 축을 main 에 안정적으로 정착시키는 것이었습니다.

## 2. 본 세션의 성과 (12 TASK 연속 봉인)

TASK 번호별 요약 + 운영 가이드 인덱스:

| TASK | 의도 | 운영 가이드 | main commit |
|---|---|---|---|
| **TASK-102** | PROJECT_PROFILE §3 명령 박스 + §3.5/§3.6/§3.10/§3.11/§3.12 회귀 baseline 양축 동기화 (memory/Postgres 동등 baseline) | [project-profile-baseline-postgres-sync-2026-07-20.md](operations/project-profile-baseline-postgres-sync-2026-07-20.md) | `4ad57f2` |
| **TASK-103** | `scripts/migrate.ts` standalone CLI 운영 workflow + 권고 스크립트 `scripts/db-migrate.sh` (6 게이트 단일 entrypoint) | [migration-cli-workflow-2026-07-20.md](operations/migration-cli-workflow-2026-07-20.md) | `7b74614` |
| **TASK-104** | build_source SLO + TOAST follow-up 운영 가이드 (현 주소 / 트리거 / 후속 후보 / 결정 분리 절차) | [build-source-toast-strategy-2026-07-20.md](operations/build-source-toast-strategy-2026-07-20.md) | `d4fb554` |
| **TASK-105** | 운영 배포 체크리스트 운영 가이드 (8 섹션 — Pre-deploy / Deploy / Verify / Post-deploy Monitoring / DR-Rollback / Operational Safety / 운영 환경 baseline 갱신 / follow-up) | [release-checklist-2026-07-20.md](operations/release-checklist-2026-07-20.md) | `4de639c` |
| **TASK-106** | source archive chunked split + multi-row schema (TASK-104 trigger 1+ 2 해결) — 신규 migrations/0006 + build_source_chunk schema + 신규 endpoint `POST /builds/:id/source/chunk` + chunked multi-row envelope + 11 cases + 신규 e2e 2 종 | [source-archive-chunked-2026-07-20.md](operations/source-archive-chunked-2026-07-20.md) | `fadddcf` |
| **TASK-107** | RFC 7233 Content-Range chunked wire-format follow-up 권장 (의미 A/B/C 3 종 + 권장 의미 C bipartite 결정) | (PROJECT_PROFILE §3 신규 항목) | `7c25a06` |
| **TASK-108** | RFC 7233 Content-Range 의미 C bipartite 완전 봉인 — 신규 `ContentRangeParts`/`parseContentRange` + 4 case 회귀 가드 | [content-range-rfc-7233-2026-07-20.md](operations/content-range-rfc-7233-2026-07-20.md) | `4e5161e` |
| **TASK-109** | RFC 7233 §4.2 `*` 케이스 (unknown total) dynamic boundary check 봉인 (lenient default) | [content-range-rfc-7233-star-2026-07-20.md](operations/content-range-rfc-7233-star-2026-07-20.md) | `0663785` |
| **TASK-110** | `STRICT_CONTENT_RANGE=true` env flag 의 운영적 strict 모드 봉인 (4 종 dispatch) | [content-range-rfc-7233-strict-mode-2026-07-20.md](operations/content-range-rfc-7233-strict-mode-2026-07-20.md) | `1105a8e` |
| **TASK-111** | production-semantic 의 Postgres backend 동등 보강 (TASK-085 memory variant 의 sister variant) | [production-semantic-postgres-2026-07-20.md](operations/production-semantic-postgres-2026-07-20.md) | `3369d0a` |
| **TASK-112** | TASK-085 ↔ TASK-111 양 variant 운영 가이드 cross-reference (신규 TASK-085 운영 가이드 포함) | [production-semantic-2026-07-07.md](operations/production-semantic-2026-07-07.md) | `81110df` |
| **TASK-113** | chunked multi-runner cross-backend 회귀 가드 (TASK-082 의 multi-runner + TASK-106/108/109/110 chunked wire-format 의 4 종 동시 사용) | [multi-runner-chunked-postgres-2026-07-20.md](operations/multi-runner-chunked-postgres-2026-07-20.md) | `7e9f777` |

**누적 회귀 baseline**: TASK-088 baseline 대비 **vitest 7 → 130 (+123)** / **build-server 113 → 165 (+52)** / **TS 5 packages clean** / **postgres migration 0001~0006 적용 정상** / **vite build:react gzip js 99.01KB / css 30.62KB 동일**.

## 3. 결정 항목 인덱스 (이미 본 세션에서 모두 해소)

본 세션 시작 시점에 운영자가 별도 결정 항목 4 종:

| 항목 | 본 세션의 TASK |
|---|---|
| PROJECT_PROFILE §3 명령 박스 + run_local / run_local_postgres 정합 | TASK-102 |
| scripts/migrate.ts 의 standalone CLI 운영 workflow | TASK-103 |
| postgres migration 0004 build_source TOAST 전략 | TASK-104 운영 가이드 |
| 운영 안정화 (release workflow / CHANGELOG / 운영 배포 체크리스트) | TASK-105 운영 가이드 |

본 TASK-104 의 trigger 5 종 중 1+ 2 (multi-GB source / 200+ MiB regular) 가 TASK-106 + TASK-108 + TASK-109 + TASK-110 + TASK-113 으로 후속 봉인 완료.

## 4. 신규 파일 인벤토리

### 신규 운영 가이드 (10 종)
- `docs/operations/project-profile-baseline-postgres-sync-2026-07-20.md`
- `docs/operations/migration-cli-workflow-2026-07-20.md`
- `docs/operations/build-source-toast-strategy-2026-07-20.md`
- `docs/operations/release-checklist-2026-07-20.md`
- `docs/operations/source-archive-chunked-2026-07-20.md`
- `docs/operations/content-range-rfc-7233-2026-07-20.md`
- `docs/operations/content-range-rfc-7233-star-2026-07-20.md`
- `docs/operations/content-range-rfc-7233-strict-mode-2026-07-20.md`
- `docs/operations/production-semantic-postgres-2026-07-20.md`
- `docs/operations/production-semantic-2026-07-07.md` (TASK-085 신규 운영 가이드, TASK-112 봉인)
- `docs/operations/multi-runner-chunked-postgres-2026-07-20.md`

(실제 운영 가이드 신규 11 종.)

### 신규 코드 파일 (6 종)
- `apps/build-server/migrations/0006_build_source_chunked.sql` (TASK-106)
- `packages/db/src/schema/build-source-chunk.ts` (TASK-106)
- `scripts/db-migrate.sh` (TASK-103)
- `apps/build-server/scripts/e2e-source-archive-chunked.sh` + `e2e-source-archive-chunked-postgres.sh` (TASK-106)
- `apps/build-server/scripts/e2e-production-semantic-postgres.sh` (TASK-111)
- `apps/build-server/scripts/e2e-multi-runner-chunked-postgres.sh` (TASK-113)

### 신규 compose override (2 종)
- `compose.dev.e2e-production-postgres.yaml` (TASK-111)
- `compose.dev.multi-runner-chunked-postgres.yaml` (TASK-113)

### 신규 테스트 (회귀 가드 누적 +26 cases)
- build-source-chunked.test.ts +11 (TASK-106 의미 B monotonic)
- build-source-chunked.test.ts +4 (TASK-108 의미 C bipartite)
- build-source-chunked.test.ts +3 (TASK-109 `*` 케이스)
- build-source-chunked.test.ts +4 (TASK-110 strict 모드)
- 신규 e2e 스크립트 4 종 ALL PASS (multi-runner-chunked / production-semantic-postgres / source-archive-chunked-postgres / source-archive-chunked)

## 5. 운영 가이드 인덱스 (32 종)

| 운영 가이드 | 관련 TASK | 비고 |
|---|---|---|
| `container-self-dogfood.md` | TASK-078 | (기존) |
| `dogfood-e2e-2026-07-06.md` | TASK-078 | (기존) |
| `dogfood-e2e-review-and-followup-2026-07-06.md` | TASK-078 | (기존) |
| `admin-runner-register-2026-07-07.md` | TASK-077 | (기존) |
| `production-semantic-2026-07-07.md` | **TASK-085 / TASK-112** | 본 세션 신규 |
| `multi-runner-claim-2026-07-06.md` | TASK-081-B | (기존) |
| `multi-runner-claim-postgres-2026-07-06.md` | TASK-082 | (기존) |
| `build-monitor-ui-visual-2026-07-06.md` | TASK-083 | (기존) |
| `insecure-registry-only-2026-07-07.md` | TASK-076 | (기존) |
| `smoke-and-migration.md` | TASK-064 | (기존) |
| `svelte-cleanup-2026-07-08.md` | TASK-094 | (기존) |
| `single-port-react-2026-07-08.md` | TASK-093 | (기존) |
| `design-tokens-react-svelte-2026-07-08.md` | TASK-096.5 | (기존) |
| `admin-entry-react-2026-07-08.md` | TASK-097 | (기존) |
| `admin-pages-react-2026-07-08.md` | TASK-098 | (기존) |
| `svelte-scaffold-cleanup-2026-07-18.md` | TASK-101 | (기존) |
| `app-router-simplify-2026-07-18.md` | TASK-100 | (기존) |
| `design-tokens-unification-2026-07-18.md` | TASK-096.5 | (기존) |
| `project-profile-react-baseline-2026-07-18.md` | TASK-101 batch 1 | (기존) |
| `project-profile-react-baseline-full-sync-2026-07-18.md` | TASK-101 batch 2 | (기존) |
| `build-request-api-console-react-2026-07-18.md` | TASK-099 | (기존) |
| `source-archive-postgres-2026-07-18.md` | TASK-066 batch 3 | (기존) |
| `project-profile-baseline-postgres-sync-2026-07-20.md` | **TASK-102** | 본 세션 신규 |
| `migration-cli-workflow-2026-07-20.md` | **TASK-103** | 본 세션 신규 |
| `build-source-toast-strategy-2026-07-20.md` | **TASK-104** | 본 세션 신규 |
| `release-checklist-2026-07-20.md` | **TASK-105** | 본 세션 신규 |
| `source-archive-chunked-2026-07-20.md` | **TASK-106** | 본 세션 신규 |
| `content-range-rfc-7233-2026-07-20.md` | **TASK-108** | 본 세션 신규 |
| `content-range-rfc-7233-star-2026-07-20.md` | **TASK-109** | 본 세션 신규 |
| `content-range-rfc-7233-strict-mode-2026-07-20.md` | **TASK-110** | 본 세션 신규 |
| `production-semantic-postgres-2026-07-20.md` | **TASK-111** | 본 세션 신규 |
| `multi-runner-chunked-postgres-2026-07-20.md` | **TASK-113** | 본 세션 신규 |

## 6. 운영자 release staging 운영 가이드

본 세션 종료 후 운영자가 release staging 단계에서 권장하는 검증 순서 (TASK-105 운영 배포 체크리스트 + 신규 운영 가이드들 정합):

```bash
# Phase 1: migration 운영 검증 (TASK-103 권고 스크립트 + TASK-104 운영 가이드)
scripts/db-migrate.sh --plan                   # dry-run (no apply)
scripts/db-migrate.sh --status                 # 0001~0006 applied status

# Phase 2: source archive 운영 검증 (TASK-106 + TASK-108 + TASK-110)
bash apps/build-server/scripts/e2e-source-archive.sh                                # memory backend legacy
bash apps/build-server/scripts/e2e-source-archive-postgres.sh                       # postgres backend legacy + bytea
bash apps/build-server/scripts/e2e-source-archive-chunked.sh                        # memory backend chunked (TASK-106)
bash apps/build-server/scripts/e2e-source-archive-chunked-postgres.sh               # postgres backend chunked (TASK-106)

# Phase 3: multi-runner 운영 검증 (TASK-082 / TASK-113)
bash apps/build-server/scripts/e2e-multi-runner-postgres.sh                        # memory + postgres multi-runner (TASK-082)
bash apps/build-server/scripts/e2e-multi-runner-chunked-postgres.sh                 # chunked + multi-runner + strict 모드 (TASK-113)

# Phase 4: production-semantic 운영 검증 (TASK-085 / TASK-111 / TASK-112)
bash apps/build-server/scripts/e2e-production-semantic.sh                           # memory variant (TASK-085)
bash apps/build-server/scripts/e2e-production-semantic-postgres.sh                  # postgres variant (TASK-111)

# Phase 5: 단일 포트 reverse proxy (TASK-075 회귀)
bash apps/build-server/scripts/e2e-single-port.sh
```

운영자 운영 가이드 인덱스 진입점은 `docs/PROJECT_PROFILE.md` 의 다음에 읽을 문서 35 종 reference.

## 7. 회귀 baseline 종합 (TASK-088 baseline 대비)

| 항목 | 누적 변화 |
|---|---|
| vitest | 7 → 130 (+123, frontend Svelte 135 case 일괄 삭제 + 신규 +26) |
| build-server node:test | 113 → 165 (+52, legacy 143 변경 0 + chunked 의미 B +11 + 의미 C +4 + `*` +3 + strict +4 / + 신규 운영 / 신규 회귀 가드 0) |
| Go 7+ packages | PASS (불변) |
| TS 5 packages `tsc --noEmit` | clean (불변) |
| vite build:react gzip | js 99.01KB / css 30.62KB (불변) |
| postgres migration | 0001~0006 (TASK-106 신규 0006 추가) |
| 신규 운영 가이드 | 11 종 (TASK-102/103/104/105/106/108/109/110/111/113 + TASK-085/112 via 112) |
| 신규 e2e 스크립트 | 5 종 (db-migrate, e2e-source-archive-chunked ±, e2e-production-semantic-postgres, e2e-multi-runner-chunked-postgres) |
| 신규 compose override | 2 종 (e2e-production-postgres, multi-runner-chunked-postgres) |
| 신규 schema | 1 종 (build_source_chunk + migration 0006) |

## 8. follow-up 후보 인덱스

본 세션이 결정 항목 4 종을 모두 해소한 뒤의 후속 TASK 후보 (별도 사용자 결정 대기):

| 후보 | 의도 | 출처 |
|---|---|---|
| 옵션 Z — 외부 object storage (S3 / MinIO) | TASK-104 trigger 의 후속 결정. GB+ 단위 source archive 흡수 | TASK-104 운영 가이드 §5 |
| 신규 기능 추가 | 신규 user-facing feature (build source UI 개선 / API key / SSO 등) | 본 세션 follow-up |
| Nextcloud Tasks 통합 (build-monitor `Tasks` 페이지) | TASK-087 follow-up 옵션 (a) (b) | TASK-087 / (c) 의 후속 |
| release notes 후속 TASK (CHANGELOG) | TASK-105 운영 후 자연스러운 후속 (옵션 B/C) | TASK-105 운영 가이드 §5 |
| CI 단계 migration validation 자동화 | PR 마다 staging DB 임시 instance 로 dry-run 검증 | TASK-103 운영 가이드 §6 |
| git tag + version bump release workflow | TASK-105 운영 후 권장 옵션 C | TASK-105 운영 가이드 §5 |
| 운영자 client 정렬 staging checklist | STRICT 모드 ON 시점에 client 가 numeric total 의무화에 정렬 검증 | TASK-110 운영 가이드 §7 |

## 9. 운영 영향 요약

본 세션의 모든 TASK 가 운영자의 기존 동작에 breaking change 0 을 보존:
- TASK-102: PROJECT_PROFILE 정합 (기존 baseline 변경 0, 표기 정합만)
- TASK-103: 신규 권고 스크립트 추가 (기존 standalone CLI 변경 0)
- TASK-104 / TASK-105 / TASK-112: docs only (기존 동작 변경 0)
- TASK-106: 신규 chunked endpoint 추가 + legacy endpoint 보존 (기존 single-shot callers 변경 0)
- TASK-107 / TASK-108 / TASK-109 / TASK-110 / TASK-111 / TASK-113: 신규 / 신규 운영 가이드 (기존 동작 변경 0)

운영자가 본 세션의 결과를 release staging 에 적용하면 운영 검증 8 종 회귀 가드를 모두 통과해야 production release 진행.

## 10. 다음 세션 가이드

- **다음 세션 시작 시 baseline**: main HEAD `53adb75` (TASK-122 sync, **v0.1.0 tagged**), 본 RELEASE_NOTES + [`CHANGELOG.md`](../../CHANGELOG.md) + 32 운영 가이드 + 165 build-server 회귀 가드
- **v0.1.0 tag anchor**: [`v0.1.0`](../../CHANGELOG.md) (annotated, 2026-07-20) — 본 세션 13 TASK (TASK-102~114) + TASK-122 working tree clean 보존 누적. 운영자 release staging 의 단일 anchor.
- **후속 결정 해소 시**: workflow meta sync 새 TASK 가 본 RELEASE_NOTES 의 §5 + §8 + CHANGELOG §2 + §5 에 append
- **본 세션 종합 검토 후속**: 옵션 Z 외부 object storage 결정 (본 §8 의 후보 1) — TASK-114 의 본 RELEASE_NOTES 에 append 되는 §11 의 향후 결정 항목
- **장기 follow-up**: 본 세션의 12 TASK 가 운영 환경 release staging 통과 후 신규 기능 추가 / Nextcloud Tasks 통합 결정 진입
