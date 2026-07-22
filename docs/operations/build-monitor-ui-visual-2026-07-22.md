# build-monitor UI 시각 QA baseline (TASK-152)

- 문서 목적: build-monitor (React 19 + Astryx) 의 **light / dark 양 모드 × 현 라우트 셋 + 1호 오버레이** 를 Playwright headless 로 캡처해 픽셀 diff baseline 으로 고정하는 절차 — 캡처 / 승격 / diff 검증 / 단위 테스트 / 한계.
- 범위: `apps/build-monitor/tests/visual/capture.py` / `diff.py` / `test_diff.py` / `README.md` / `baseline/` 디렉터리 정책 + `docs/DESIGN.md` v2 와의 정합
- 대상 독자: 개발자, AI agent, 운영자
- 상태: stable
- 최종 수정일: 2026-07-22
- 관련 문서: [DESIGN.md](../DESIGN.md), [테마별 시각 회귀 가드](theme-contrast-guard-2026-07-21.md), [B층 가드 오버레이 확장](b-layer-overlay-extension-2026-07-22.md), [CI 통합](ci-integration-2026-07-22.md)

## 1. 왜 하는가

TASK-047 의 Svelte 5 시절 시각 baseline (capture.py v1) 은 React 19 + Astryx 이관 (TASK-088~151) 이후 라우트 셋 / 마크업 / 테마 모델이 전면 교체되어 무용지물이 됐다. B층 가드(TASK-133/145/146/148) 는 "대비 위반 / CSS 유출" 같은 **규칙 위반**을 잡지만, "토큰이 의도대로 적용됐는지 / 레이아웃이 무너지지 않았는지" 같은 **시각적 회귀**는 사람 눈 또는 픽셀 diff 가 필요하다.

본 baseline 은 그 픽셀 diff 축이다. 현 라우트 셋을 light / dark 양 모드로 캡처해 baseline 으로 고정하고, 이후 CSS / 토큰 / 컴포넌트 변경이 시각 회귀를 냈는지 `diff.py` 로 자동 판정한다.

`docs/DESIGN.md` v2 (React 19 + Astryx 0.1.4 정합) 가 "무엇이 옳은 UI 인가"의 서술 SSOT 라면, 본 baseline 은 그 서술의 **픽셀 실측 스냅샷**이다.

## 2. 라우트 선택 근거 (현 App.tsx 정합)

`capture.py` 의 `ROUTES` 는 현 `App.tsx` 라우트 셋과 1:1 정합한다 (9 라우트 × 2 모드 = 18 PNG + 모달 2 = **20 PNG**).

| 라우트 | 경로 | 시각 검증 포인트 |
|---|---|---|
| `login` | `/login` | input border + 토큰 bg + Welcome 카드 (TASK-099). userId 없는 격리 컨텍스트 |
| `builds` | `/builds` | Astryx Table 4열 + StatusPill 배지 정책 (TASK-141/142) |
| `build-detail` | `/builds/<id>` | PhaseTimeline **11 phase** (TASK-150) + LogStream CodeBlock (TASK-140) |
| `build-request` | `/build-request` | Astryx TextInput / NumberInput × 8필드 + 에러 결속 (TASK-138) |
| `api-console` | `/api-console` | Swagger UI iframe + frame-wrap 스코프 |
| `admin-builds` | `/admin/builds` | admin 라우트 가드 + Table (TASK-143) |
| `admin-users` | `/admin/users` | admin Table |
| `admin-admins` | `/admin/admins` | admin Table |
| `admin-runners` | `/admin/runners` | admin Table + "+ Register Runner" 버튼 (별도 격리 컨텍스트 캡처) |
| `admin-runners`(modal) | `/admin/runners` → click | **RegisterRunnerModal** — TASK-148 의 1호 오버레이 실증. 가드 baseline 에 modal-open 상태 포함 |

**mock 로그인**: `localStorage.userId = 'yky.lee'` (ADMIN_IDS 첫 멤버) 주입으로 admin 가드 통과. `login` 만 userId 없는 별도 컨텍스트라 Welcome 카드가 redirect 없이 노출된다.

## 3. 절차

### 3.1 사전 준비

```bash
# 시스템 Python 에 playwright + Pillow (venv 권장이지만 --user 도 가능)
pip3 install --user --break-system-packages playwright Pillow

# google-chrome 이 설치돼 있어야 함 (channel="chrome").
# playwright 번들 chromium 은 우리 네트워크에서 CDN ETIMEDOUT (TASK-132/133 확립).
which google-chrome
```

### 3.2 앱 기동 (build-server memory + vite dev)

```bash
# 터미널 1 — build-server (memory backend)
BUILD_REPOSITORY_BACKEND=memory \
  node apps/build-server/dist/apps/build-server/src/index.js
# → GET /health 가 {"status":"ok"} 여야 준비 완료

# 터미널 2 — frontend dev (vite.react.config, port 5174)
cd apps/build-monitor && ./node_modules/.bin/vite \
  --config vite.react.config.ts --port 5174 --strictPort
```

> `@vitejs/plugin-react` 미설치로 vite 가 안 뜨면 루트에서 `pnpm install` (lockfile 정합) 후 재기동.

### 3.3 캡처

```bash
python3 apps/build-monitor/tests/visual/capture.py \
    --base http://127.0.0.1:5174 \
    --out .visual/$(date -u +%Y-%m-%dT%H-%M-%SZ)
```

- 출력: `.visual/<ts>/{route}/{mode}.png` + `admin-runners/{mode}-modal.png` = 20 PNG.
- `--routes login,builds` 로 부분 캡처 가능 (디버깅용).
- `.visual/` 는 `.gitignore` 대상 (local-only). PNG 자체는 git 에 안 들어간다.

### 3.4 baseline 으로 승격 (의도된 UI 변경인 경우)

```bash
rm -rf apps/build-monitor/tests/visual/baseline
mkdir -p apps/build-monitor/tests/visual/baseline
cp -r .visual/<ts>/* apps/build-monitor/tests/visual/baseline/
```

`tests/visual/baseline/` 도 `.gitignore` 대상이다 — **PNG 는 binary 라 git 에 넣지 않고**, `capture.py` + `diff.py` + `README.md` + 이 문서만 tracked. 운영자는 승격한 PNG 를 git LFS / 외부 저장소로 동기화한다 (§6 한계 참고).

## 4. diff 검증

```bash
python3 apps/build-monitor/tests/visual/diff.py \
    --baseline apps/build-monitor/tests/visual/baseline \
    --run .visual/<ts> \
    --threshold 0.001
```

- `--threshold 0.001` = 0.1% 초과 픽셀 차이면 FAIL (default).
- `--out-diff .visual/diff/<ts>` = 초과 항목만 diff PNG 저장.
- `--allow-missing` = baseline 없는 신규 라우트 skip (초기 도입 시).
- exit code: `0` 이내 / `1` 초과·missing / `2` 인자 오류.

**self-test** (승격 직후 run == baseline 이라 0 차이여야 함):

```
matched: 20
missing: 0
exceeded: 0
PASS
```

2026-07-22 실측 (`.visual/2026-07-22T23-40-13Z`): 20/20 전부 `ratio=0.0000 ≤ 0.001`, exit 0.

## 5. 단위 테스트

```bash
python3 apps/build-monitor/tests/visual/test_diff.py
```

`diff.py` 의 matched / exceeded / missing / allow-missing / size-mismatch 분기를 임시 PNG 로 검증한다 (Pillow 필요). 2026-07-22 실측: 5 테스트 전부 PASS.

- `test_passes_when_identical`
- `test_exceeds_when_one_pixel_differs_significantly`
- `test_missing_when_baseline_absent`
- `test_allow_missing_skips`
- `test_size_mismatch_is_max_diff`

## 6. 한계

- **mock 로그인 상태** (`localStorage.userId` 주입) 라 `/builds` · `/admin/*` 의 실제 데이터 fetch 는 비어있거나 에러 화면일 수 있다. 목적은 "토큰이 의도대로 적용됐는가" 라 데이터 의존 없는 정적 surface 위주.
- **테마 모델의 캡처 난점** — React 19 SPA 의 `themeStore.init()` 은 mount-time 1회만 localStorage 의 theme 를 읽는다. SPA navigate 로는 mode 가 안 바뀌므로 `capture.py` 는 **setItem + page.reload + screenshot 직전 `data-theme` 강제 적용** 3단계로 안정화한다. `<Theme>` 의 useEffect 가 mode 를 reset 할 수 있어 screenshot 직전 evaluate 가 필수.
- **admin-runners / 모달은 별도 격리 컨텍스트** — cold start + 누적 page state 가 admin 가드(`ensureAdminAccess`) fetch 를 늦추는 영향을 차단하기 위해 `capture_admin_runners_isolated` / `capture_modal` 로 분리했다.
- **폰트 anti-aliasing** — 일부 브라우저 폰트 AA 는 baseline 대비 0.01% 수준 미세 차이를 낸다. threshold 를 너무 낮게 잡으면 CI 가 자주 깨진다. 0.1% 가 권장 시작점.
- **PNG 외부 동기화 미결** — baseline PNG 는 git 에서 제외되므로 CI 통합(nightly-visual 워크플로) 시 git LFS / 외부 저장소 동기화 정책이 선행 결정돼야 한다. 현재는 로컬 승격 + 개발자 수동 diff 축.

## 7. 변경 이력

- **TASK-047** (2026-07-04) — Svelte 5 baseline 1차 (`capture.py` v1 + `diff.py` + `test_diff.py`).
- **TASK-064** (2026-07-08) — `diff.py` 의 `--allow-missing` 등 옵션 + `test_diff.py` 단위 테스트.
- **TASK-152** (2026-07-22) — **React 19 + Astryx baseline 전면 갱신**. `capture.py` v3 (channel chrome / 현 9 라우트 + RegisterRunnerModal / data-theme 강제 적용 3단계) + `docs/DESIGN.md` v2 정합 + 본 운영 가이드. 실측: 20 PNG 캡처 / diff self-test 20/20 PASS / 단위 테스트 5/5 PASS.
