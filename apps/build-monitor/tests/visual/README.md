# Visual QA baseline (TASK-047 / TASK-064 / **TASK-152**)

이 디렉터리는 Playwright headless 로 build-monitor 의 **두 모드
(light / dark) × 9 라우트 + 1 모달** PNG baseline 을 보관한다. PNG
자체는 binary 라 git 에 들어가지 않고, `baseline/` 디렉터리 구조 +
이 README + `capture.py` + `diff.py` 스크립트가 본 baseline 의 기반이다.

## 라우트 선택 근거 (현 App.tsx 정합, TASK-152)

- `login` — input border + token bg + Welcome 카드 (TASK-099)
- `builds` — Astryx Table 4열 + StatusPill 배지 (TASK-141/142)
- `build-detail` — PhaseTimeline 11 phase (TASK-150) + LogStream
  CodeBlock (TASK-140)
- `build-request` — Astryx TextInput/NumberInput × 8필드 + 에러 결속
  (TASK-138)
- `api-console` — Swagger UI iframe + frame-wrap 스코프
- `admin-builds` / `admin-users` / `admin-admins` / `admin-runners` —
  4 admin 페이지. TASK-143 의 라우트 가드.
- `admin-runners-{dark,light}-modal` — RegisterRunnerModal (TASK-137).
  **TASK-148 의 1호 오버레이 실증** — 가드 baseline 에 modal-open
  상태 포함.

## 절차

### 1. Baseline 캡쳐 (또는 재생성)

Build Server (memory backend) + build-monitor dev server 를 동시에 띄운다:

```bash
# 터미널 1 — build-server (TASK-125 memory backend)
BUILD_REPOSITORY_BACKEND=memory \
  ./node_modules/.bin/tsx apps/build-server/src/index.js

# 터미널 2 — frontend dev (TASK-093 + vite.react.config, port 5174)
cd apps/build-monitor && ./node_modules/.bin/vite \
  --config vite.react.config.ts --port 5174 --strictPort
```

캡쳐 스크립트 실행 (TASK-152 갱신: channel chrome + 현 라우트 셋):

```bash
python3 apps/build-monitor/tests/visual/capture.py \
    --base http://127.0.0.1:5174 \
    --out .visual/$(date -u +%Y-%m-%dT%H-%M-%SZ)
```

결과 (10 PNG × 2 모드 + 2 모달 = 20 PNG):

```
.visual/2026-07-22T13-30-00Z/
  login/{dark,light}.png
  builds/{dark,light}.png
  build-detail/{dark,light}.png
  build-request/{dark,light}.png
  api-console/{dark,light}.png
  admin-builds/{dark,light}.png
  admin-users/{dark,light}.png
  admin-admins/{dark,light}.png
  admin-runners/{dark,light}.png
  admin-runners/{dark,light}-modal.png   # TASK-148 1호 오버레이
```

### 2. baseline 으로 승격 (의도된 UI 변경인 경우)

```bash
# 새 baseline 디렉터리를 만들고자 할 때 (PNG 자체는 binary 라 별도 보관)
rm -rf apps/build-monitor/tests/visual/baseline
mkdir -p apps/build-monitor/tests/visual/baseline
cp -r .visual/2026-07-22T13-30-00Z/* apps/build-monitor/tests/visual/baseline/
# → 새 PNG 들은 git LFS 또는 외부 diff 도구로 관리. 본 PR 은 스크립트 +
#   디렉터리 구조만 commit.
```

### 3. Baseline 대비 diff 검증 (CI/PR 체크)

```bash
# 의존성: Pillow. 시스템 Python 보호 위해 venv 권장.
python3 -m venv .venv-visual
source .venv-visual/bin/activate
pip install Pillow

python3 apps/build-monitor/tests/visual/diff.py \
    --baseline apps/build-monitor/tests/visual/baseline \
    --run .visual/2026-07-22T13-30-00Z \
    --threshold 0.001
```

- `--threshold 0.001` = 0.1% 초과 픽셀 차이면 FAIL (default)
- `--out-diff .visual/diff/<ts>` = 초과한 항목만 diff PNG 저장
- `--allow-missing` = baseline 이 없는 신규 라우트는 skip (초기 도입 시)

**TASK-149 의 CI 통합 가드** (nightly): `run-b-layer-guards.sh` 와 별개
스케줄로 `capture.py` + `diff.py` 를 `nightly-visual` 워크플로에 동시
연계 권장 — CSS 변경의 시각 회귀를 1% threshold 로 자동 검출.

exit code:
- `0` — 모든 라우트/모드 baseline 과 diff 가 threshold 이내
- `1` — threshold 초과 또는 missing
- `2` — 인자 오류

### 4. 단위 테스트

```bash
python3 apps/build-monitor/tests/visual/test_diff.py
```

`diff.py` 의 matched / missing / exceeded 분기를 임시 PNG 로 검증.
Pillow 가 설치돼 있어야 한다.

## 한계

- mock 로그인 상태 (`localStorage.userId` = 'admin' 주입) 라
  /builds · /admin/* 의 실제 데이터 fetch 는 비어있거나 에러 화면일
  수 있다. 시각 검증의 목적은 "토큰이 의도대로 적용됐는지" 라
  데이터 의존성 없는 정적 surface 위주.
- 두 모드 비교가 핵심 — 동일 페이지의 light/dark PNG 가 "분리 가능"
  해야 통과.
- 일부 브라우저 폰트 anti-aliasing 은 baseline 보다 0.01% 수준의 미세
  차이를 만들 수 있어 threshold 를 너무 낮게 잡으면 CI 가 자주 깨진다.
  0.1% 가 권장 시작점.
- React 19 + lazy 청크 + `<Theme>` 의 StyleX CSS-in-JS 가 모두 로드된
  상태에서 캡쳐해야 의미 있다. `capture.py` 의 800ms settle + 5초
  selector wait 가 그 합성 신호. 더 보수적으로 가려면 `wait_for_load_state('networkidle')` + 1초 추가.

## 변경 이력

- **TASK-047** (2026-07-04) — Svelte 5 baseline 1차 작성. `tests/visual/{capture,diff,test_diff}.py` + `README.md`.
- **TASK-064** (2026-07-08) — `diff.py` 의 `--allow-missing` 등 옵션 추가, `test_diff.py` 단위 테스트.
- **TASK-152** (2026-07-22) — **React 19 + Astryx baseline 으로 전면 갱신**. channel chrome / 현 9 라우트 + RegisterRunnerModal / `docs/DESIGN.md` v2 정합.
