# Visual QA baseline (TASK-047)

이 디렉터리는 Playwright headless 로 build-monitor 의 두 모드 (light / dark) 핵심
라우트 PNG baseline 을 보관한다. PNG 자체는 binary 라 git 에 들어가지 않지만,
`baseline/` 디렉터리 구조 + 이 README + `capture.py` 스크립트가 본 baseline 의
기반이다.

## Baseline 재생성 절차

1. Build Server (memory backend) + build-monitor dev server 를 동시에 띄운다:
   ```bash
   pnpm --filter build-server dev   # 3000
   pnpm --filter build-monitor dev  # 5173
   ```
2. 캡쳐 스크립트 실행:
   ```bash
   python3 apps/build-monitor/tests/visual/capture.py --out .visual/$(date -u +%Y-%m-%dT%H-%M-%SZ)
   ```
3. baseline 디렉터리에 라우트별 PNG 가 생성된다:
   ```
   baseline/
     login/{dark,light}.png
     builds/{dark,light}.png
     admin-builds/{dark,light}.png
     admin-users/{dark,light}.png
     admin-admins/{dark,light}.png
   ```
4. PNG 자체는 binary 라 git LFS 또는 외부 diff 도구로 관리하고, 본 PR 은
   스크립트 + 디렉터리 구조만 commit.

## Diff 절차 (후속)

`apps/build-monitor/tests/visual/diff.py` (후속 PR 예정) 가 두 디렉터리를 받아
pixelmatch 로 PNG diff 를 돌리고, threshold (default 0.1%) 초과 시 exit 1.
baseline 이 의도된 UI 변경이면 새 baseline 으로 덮어쓰고 PR 에 첨부.

## 라우트 선택 근거

- `login/` — input border + token bg (TASK-046 핵심 surface)
- `builds/` — StatusPill EXPIRED/UNKNOWN secondary 토큰 (TASK-046)
- `admin-builds/` — BuildRow owner-cell + table row hover (surface-elevated)
- `admin-users/` — AdminUsers header + empty state (.muted)
- `admin-admins/` — AdminAdmins 페이지 (TASK-049) — 신규 surface

## 한계

- mock 로그인 상태 (`localStorage.userId`/`adminId` 주입) 라 /builds · /admin/*
  의 실제 데이터 fetch 는 비어있거나 에러 화면일 수 있다. 시각 검증의 목적은
  "토큰이 의도대로 적용됐는지" 라 데이터 의존성 없는 정적 surface 위주.
- 두 모드 비교가 핵심 — 동일 페이지의 light/diff PNG 가 "분리 가능" 해야 통과.
