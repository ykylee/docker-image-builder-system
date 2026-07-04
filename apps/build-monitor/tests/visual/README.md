# Visual QA baseline (TASK-047 / TASK-064)

이 디렉터리는 Playwright headless 로 build-monitor 의 두 모드 (light /
dark) 핵심 라우트 PNG baseline 을 보관한다. PNG 자체는 binary 라 git 에
들어가지 않지만, `baseline/` 디렉터리 구조 + 이 README + `capture.py` +
`diff.py` 스크립트가 본 baseline 의 기반이다.

## 라우트 선택 근거

- `login/` — input border + token bg (TASK-046 핵심 surface)
- `builds/` — StatusPill EXPIRED/UNKNOWN secondary 토큰 (TASK-046)
- `admin-builds/` — BuildRow owner-cell + table row hover (surface-elevated)
- `admin-users/` — AdminUsers header + empty state (.muted)
- `admin-admins/` — AdminAdmins 페이지 (TASK-049) — 신규 surface

## 절차

### 1. Baseline 캡쳐 (또는 재생성)

Build Server (memory backend) + build-monitor dev server 를 동시에 띄운다:

```bash
# 터미널 1
BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js

# 터미널 2
cd apps/build-monitor && rtk ./node_modules/.bin/vite --port 5173
```

캡쳐 스크립트 실행:

```bash
python3 apps/build-monitor/tests/visual/capture.py \
    --out .visual/$(date -u +%Y-%m-%dT%H-%M-%SZ)
```

결과:

```
.visual/2026-07-04T14-30-00Z/
  login/{dark,light}.png
  builds/{dark,light}.png
  admin-builds/{dark,light}.png
  admin-users/{dark,light}.png
  admin-admins/{dark,light}.png
```

### 2. baseline 으로 승격 (의도된 UI 변경인 경우)

```bash
# 새 baseline 디렉터리를 만들고자 할 때 (PNG 자체는 binary 라 별도 보관)
rm -rf apps/build-monitor/tests/visual/baseline
mkdir -p apps/build-monitor/tests/visual/baseline
cp -r .visual/2026-07-04T14-30-00Z/* apps/build-monitor/tests/visual/baseline/
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
    --run .visual/2026-07-04T14-30-00Z \
    --threshold 0.001
```

- `--threshold 0.001` = 0.1% 초과 픽셀 차이면 FAIL (default)
- `--out-diff .visual/diff/<ts>` = 초과한 항목만 diff PNG 저장
- `--allow-missing` = baseline 이 없는 신규 라우트는 skip (초기 도입 시)

exit code:
- `0` — 모든 라우트/모드 threshold 이내
- `1` — threshold 초과 또는 missing
- `2` — 인자 오류

### 4. 단위 테스트

```bash
python3 apps/build-monitor/tests/visual/test_diff.py
```

`diff.py` 의 matched / missing / exceeded 분기를 임시 PNG 로 검증.
Pillow 가 설치돼 있어야 한다.

## 한계

- mock 로그인 상태 (`localStorage.userId`/`adminId` 주입) 라 /builds ·
  /admin/* 의 실제 데이터 fetch 는 비어있거나 에러 화면일 수 있다.
  시각 검증의 목적은 "토큰이 의도대로 적용됐는지" 라 데이터 의존성
  없는 정적 surface 위주.
- 두 모드 비교가 핵심 — 동일 페이지의 light/diff PNG 가 "분리 가능"
  해야 통과.
- 일부 브라우저 폰트 anti-aliasing 은 baseline 보다 0.01% 수준의 미세
  차이를 만들 수 있어 threshold 를 너무 낮게 잡으면 CI 가 자주 깨진다.
  0.1% 가 권장 시작점.