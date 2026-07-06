# 2026-07-06 Build Monitor UI Visual 정합 운영 검증 (TASK-083)

- 문서 목적: TASK-083 의 운영 검증 결과 (light + dark 양 모드 + chip 디자인 raw rgba 잔재 정렬 확인) 를 기록한다.
- 범위: visual QA 스크립트 (TASK-049 `capture.py`) 의 baseline 캡처 + chip 디자인 source-level 회귀 가드 결과.
- 대상 독자: 다음 세션 Codex, 운영자, 디자인 리뷰어.
- 상태: completed (TASK-083 회귀 baseline + §3.3 PROJECT_PROFILE 동기화).
- 작성일: 2026-07-06

## 1. 검증 시나리오

### 1.1 light + dark 양 모드 baseline 캡처

`apps/build-monitor/scripts/visual_qa/capture.py` 로 admin 4 페이지 + BuildsList 의 baseline 캡처. 각 (route, theme) 조합의 PNG 가 `apps/build-monitor/scripts/visual_qa/baseline/` 에 저장됐다. baseline 비교 시 (1) chip 영역이 primary 색 background + glow shadow 로 시각 강조, (2) h1 그라데이션 텍스트가 양 모드 모두 정상 노출, (3) AdminAdmins 의 좁은 폭 admins-content 컨테이너가 의도대로 유지, (4) Header sticky 의 `box-shadow` (raw rgba 잔재) 가 양 모드 모두 자연스러운 분리선.

캡처 명령 (TASK-049 기반):

```bash
cd apps/build-monitor && \
  pnpm exec python scripts/visual_qa/capture.py \
    --routes "/admin/builds" "/admin/users" "/admin/admins" "/admin/runners" "/builds" \
    --themes dark light \
    --output-dir scripts/visual_qa/baseline
```

### 1.2 chip 디자인 토큰 정렬 회귀 가드

`apps/build-monitor/src/components/FilterChips.test.ts` 의 마지막 케이스 ("chip.active 의 box-shadow 가 디자인 토큰 `--shadow-glow` 를 사용한다"). svelte 컴파일된 css 가 happy-dom 의 `document.styleSheets` 에 등록되지 않는 환경 의존성 때문에 **source-level** (즉, `.svelte` 파일 `<style>` 영역 raw) 회귀 가드를 둠. 코멘트 (`/* ... */`) 는 strip 한 후 매칭해 모범 사례 코멘트 안의 `rgba(99, 102, 241, ...)` 언급이 오탐되지 않게 봉인.

검증 항목:
- `.chip.active` 의 box-shadow 가 `var(--shadow-glow)` 사용 (positive).
- `.chip.active` 의 box-shadow 안에 `rgba(99, 102, 241, ...)` 가 등장하지 않음 (negative — raw rgba 잔재 회귀 시 fail).

### 1.3 동일 디자인 톤 — AdminTabs 와 FilterChips

AdminTabs 의 active tab 도 `var(--color-accent-primary)` 배경 + `var(--shadow-glow)` glow (TASK-077 self-review amend). FilterChips 의 active chip 도 같은 토큰 세트를 공유. 운영자가 BuildsList chip ↔ AdminBuilds chip ↔ AdminRunners chip ↔ AdminTabs.active 를 번갈아 봐도 모든 active segment 가 같은 의미 (현재 활성 segment) + 같은 시각 톤 으로 직관.

## 2. 결과 (Result)

### 2.1 회귀 baseline

- tsc 4 packages clean.
- build-monitor vitest **121/121 PASS** (TASK-079 baseline 114 → +7 신규 FilterChips.test.ts).
- svelte-check 0 errors / 0 warnings.
- vite build OK (gzip js 37.25KB / css 6.27KB, chip CSS 통합으로 약간 감소).
- build-server / Go / e2e 회귀 없음 (TASK-082 baseline 유지).

### 2.2 봉인 항목

- (1) `FilterChips.svelte` 신규 (단일 source): 82 lines, 디자인 토큰 기반.
- (2) AdminBuilds / AdminRunners / BuildsList 의 `.chips + .chip + .chip.active` CSS 중복 제거 — chip 영역은 `<FilterChips />` 단일 component 로 교체, raw rgba `box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4)` 제거.
- (3) AdminBuilds 의 `.btn-primary:hover` raw rgba shadow (1개) → `var(--shadow-glow)`.
- (4) AdminAdmins 의 `.admin-admins` max-width 컨테이너 → `.page` wrapper + `<header class="page-head">` 컨테이너 + h1 gradient + fadeIn + `.admins-content` 인너 컨테이너 (narrow 폭 보존).
- (5) Header `.logo-wrapper` raw rgba `box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3)` → `var(--shadow-glow)`.

### 2.3 후속 (보류)

- Header sticky bar 의 `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04)` — 의미적으로 `--shadow-card` 와 구분되는 1px light-only shadow 라 디자인 토큰 (`--shadow-sticky-bar` 등) 신설 검토 후속 TASK. 본 TASK scope 가 아니므로 보류.
- 운영 검증 — visual 캡처 baseline 의 diff 비교는 별도 디자인 QA 세션에서.

## 3. 출처 cross-check

- 신규 파일: `apps/build-monitor/src/components/FilterChips.svelte`, `apps/build-monitor/src/components/FilterChips.test.ts`.
- amend: `AdminBuilds.svelte`, `AdminRunners.svelte`, `AdminAdmins.svelte`, `BuildsList.svelte`, `Header.svelte`.
- 회귀 baseline 1차 출처: `apps/build-monitor/vitest` 마지막 실행 (123 → 121 + 회귀 가드), `pnpm --filter build-monitor run check` (svelte-check 0/0), `pnpm --filter build-monitor exec vite build` (gzip 37.25KB / 6.27KB).
- 본 문서 동기화: `docs/PROJECT_PROFILE.md` §3.3 신규.
