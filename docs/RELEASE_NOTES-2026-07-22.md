# Release Notes — v0.2.0 (2026-07-22)

- 문서 목적: `v0.2.0` (Phase 1 완료 baseline) 의 종합 리뷰 — 변경 범위, 회귀 baseline, 검증 결과, 운영자 staging 안내.
- 범위: `v0.1.0` (`53adb75`) 이후 TASK-124 ~ TASK-152 코드 델타
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-22
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [Phase 1 회고](./PHASE-1-RETROSPECTIVE.md), [Release Notes 2026-07-20](./RELEASE_NOTES-2026-07-20.md)

## 1. 요약

`v0.2.0` 은 **Phase 1 (초기 시스템 구축) 을 종결**하는 release baseline 이다. `v0.1.0` 의 백엔드/운영 성숙도 위에 **React 19 + Astryx 프론트엔드 정식 도입 + 운영 가드 2계층 + 서버-프론트 계약 컴파일 타임 고정 + 시각 QA baseline** 을 얹었다.

- 변경 규모 (`v0.1.0..HEAD`): **100 files, +11,227 / −3,141**
- 봉인 TASK: TASK-124 ~ TASK-152 (29 TASK)
- 5 package.json: `0.1.0` → **`0.2.0`** 통일 bump
- git tag: **`v0.2.0`**

## 2. 변경 범위 (그룹별)

### 2.1 환경 / baseline 복구 (TASK-124~128)
로컬 개발 환경 셋업 과정에서 발견된 결함 3건을 전부 해소했다: runner tar 절대경로 가드의 크로스플랫폼 결함(`filepath.IsAbs` → `path.IsAbs` 병용), `POST /builds` 의 400 계약 위반(ZodError 가 500 으로 새던 것 → 400 정렬 + 회귀 가드 8건), `db-migrate.sh` 의 pnpm 실행 경로(6 게이트 실제 Postgres 실행 검증). PROJECT_PROFILE.md bulk sync 회귀도 복구.

### 2.2 서버-프론트 계약 경화 (TASK-129/130/151)
`parseApiError` envelope 계약 회귀(양쪽 green 인데 계약이 깨진 사례)를 수정하고, shared-contract 에 에러 응답 스키마를 도입해 **계약 위반을 TS 컴파일 타임에 고정**했다. build-routes 의 4xx 응답 28곳을 `errorBody`/`notFoundBody` helper 로 흡수해 envelope 일관성 확보.

### 2.3 운영 가드 2계층 (TASK-131/133/145/146/148/149)
- **문서 무결성 가드** — bulk sync 가 문서를 템플릿 빈칸으로 덮는 회귀를 두 신호(급격한 축소 + placeholder 회귀)로 검출. 히스토리 166 쌍 스캔 오탐 0 + 미발견 사고 2호 발견·복구.
- **테마별 대비 2계층 가드** — 다크/라이트 AA 위반 11건 전수 해소.
- **CSS 유출 2계층 가드** — 라우트 CSS 전역 유출(bare selector 가 Astryx atomic 을 덮음) 정적 lint + 실측 가드 + 오버레이(모달) 확장.
- **CI 분리** — PR=정적 가드, nightly/main=실측 가드.

### 2.4 UI 균형 + Astryx 정식 도입 (TASK-132/134~144/147/150/152)
Astryx 토큰 충돌 제거 + 레이아웃 셸(TASK-132) → 토큰 네임스페이스 `--dib-*`(TASK-134) → Astryx 0.1.7(TASK-135) → `<Theme>`+astryx.css 재구축(TASK-136) → 컴포넌트 3단계 이관(Dialog/TextInput/CodeBlock/Table/AppShell) → 라우트 지연 로드(TASK-139) → reset.css 미도입 결정(TASK-147, 실측 근거) → PhaseTimeline 9→11 drift 수정(TASK-150) → DESIGN.md v2 + 시각 QA 20 PNG baseline(TASK-152).

## 3. 회귀 baseline 검증 (2026-07-22 실측, 전 green)

| 스위트 | 명령 | 결과 |
|--------|------|------|
| build-monitor | `vitest run` | **277 PASS** (25 files) |
| build-server | `node --import tsx --test tests/*.test.ts` | **178 PASS** (42 suites) |
| runner | `go test ./...` | **8 pkg PASS** |
| TS 타입체크 | `tsc --noEmit` × 5 pkg | **clean** |
| 프론트 빌드 | `vite build --config vite.react.config.ts` | 초기 index js gzip **134.64 KB** / css **24.08 KB** |
| 문서 무결성 가드 | `check-doc-integrity.sh` (staged) | **PASS** |

> **미검증**: 실이미지 빌드 e2e (runner `RUNNER_DOCKER_BUILD_MODE=skeleton` 기본 + 본 로컬 Docker 미설치). Docker 환경에서 별도 검증 필요.

## 4. Breaking / 마이그레이션 영향

- **DB migration**: 변경 0 (0001~0006 유지). 별도 마이그레이션 불요.
- **API 계약**: 에러 응답 envelope 은 message 보존 + extras 동일 키 전달로 **외부 계약 동일**. `POST /builds` 는 잘못된 요청에 대해 이제 정확히 400(이전 일부 경로 500) 반환 — 클라이언트가 5xx 를 재시도 트리거로 쓰고 있었다면 확인 필요.
- **프론트엔드**: 단일 포트 서빙 유지. 딥링크 라우팅(`Sec-Fetch-Dest: document` 분기)로 SPA 라우트가 동명 API route 에 가려지지 않음.

## 5. 운영자 release staging

1. **Pre-deploy**: `git fetch` + `git checkout v0.2.0` + `git status` clean 확인 + 5 pkg version `0.2.0` 확인.
2. **Deploy**: `pnpm install` → 5 pkg TS clean → `vite build` → build-server 부팅(`applyMigrations` 자동). Postgres backend 는 `DB_AUTO_BOOTSTRAP` 확인.
3. **Verify**: `GET /health` → `{"status":"ok"}` / SPA 라우트 실브라우저 진입 / `POST /builds` 202 왕복 / `db-migrate.sh --status`.
4. **Post-deploy**: lifecycle_status 분포 + runner ACTIVE + source archive round-trip.
5. **Rollback**: `git checkout v0.1.0` 재부팅 + 회귀 baseline 재검증.

자세한 절차는 [`docs/operations/release-checklist-2026-07-20.md`](./operations/release-checklist-2026-07-20.md).

## 6. follow-up (Phase 2 진입 대기)

[CHANGELOG §5](../CHANGELOG.md) 의 follow-up 후보 7종 참조 — 사후 알림 자동화 / visual baseline CI 통합 / 외부 object storage / 신규 기능 / Nextcloud Tasks / CI migration validation / 실이미지 빌드 e2e.
