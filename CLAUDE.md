<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# CLAUDE.md (Claude Code 진입점)

- **역할**: Claude Code 가 이 저장소에서 *세션 시작 시 자동 read* 하는 진입점 문서.
- **위치**: `./CLAUDE.md` (또는 `./.claude/CLAUDE.md`) — 둘 다 자동 read.
- **AGENTS.md 와의 관계**: Claude Code 는 `AGENTS.md` 를 *직접* read 안 함. 본 프로젝트에
  `AGENTS.md` 가 이미 있으면 본 `CLAUDE.md` 의 `@AGENTS.md` import 또는 symlink 으로 통합 가능:

  ```bash
  # import 방식 (CLAUDE.md 안에 @AGENTS.md 한 줄 추가)
  @AGENTS.md

  # 또는 symlink 방식 (cross-platform 의 경우 import 권장)
  ln -s AGENTS.md CLAUDE.md
  ```

- 문서 목적: 표준 AI 워크플로우 의 *directional intent* + Claude Code 가 매 세션 알아야 할
  진입 규칙
- 대상 독자: Claude Code, 저장소 관리자, workflow 설계자
- 상태: beta
- 최종 수정일: 2026-07-20

## 항상 먼저 읽을 문서

- `ai-workflow/memory/active/state.json`
- `ai-workflow/memory/active/sessions`
- `ai-workflow/memory/active/backlog`
- `docs/PROJECT_PROFILE.md`
- `ai-workflow/wiki/index.md` — R4 anchor 기반, AI agent query 시 먼저 로드
- (있으면) `ai-workflow/memory/active/PURPOSE.md` — directional intent 1-line + body excerpt

`ai-workflow/` 는 세션 복원과 workflow 상태 관리용 메타 레이어다. 프로젝트 코드나
프로젝트 문서를 탐색할 때는 이 경로를 기본 탐색 범위에 넣지 말고, workflow 문서 자체를
갱신하거나 현재 세션 상태를 복원할 때만 예외적으로 참조한다.

## 진입 slash command (additive)

- `/workflow-session-start` — `state.json` + `session_handoff.md` + `work_backlog.md` baseline 복원
- `/workflow-backlog-update` — task 등록/갱신 + scope creep warning
- `/workflow-doc-sync` — 영향 문서 동기화 (advisory)

## 작업 원칙

- 작업을 시작하기 전에 목적, 범위, 영향 문서를 짧게 정리한다.
- 작업 상태는 `planned`, `in_progress`, `blocked`, `done` 중 하나로 관리한다.
- 검증하지 않은 결과는 완료로 확정하지 않는다.
- 세션 종료 전에는 `state.json`, `session_handoff.md`, 최신 backlog 를 갱신한다.

## 언어와 컨텍스트 원칙

- 사용자에게 직접 보이는 작업 보고, 상태 요약, 문서 갱신 문안은 기본적으로 한국어로 작성한다.
- 코드, 명령어, 파일 경로, 설정 key, 외부 시스템 고유 명칭은 필요할 때 원문 그대로 유지한다.
- 내부 사고 과정과 임시 분류는 모델이 가장 효율적인 방식으로 처리하되, 사용자에게는 필요한
  결론과 다음 행동만 짧게 전달한다.
- 장문의 중간 reasoning, 중복 요약, 불필요한 자기 설명을 피한다.
- handoff 와 backlog 에는 다음 세션에 필요한 핵심 사실만 남겨 불필요한 컨텍스트 누적을 줄인다.

## self-bootstrap (PURPOSE.md / state.json 부재 시)

`state.json` 이나 `PURPOSE.md` 가 없으면 session-start skill 이 *graceful skip* 으로
동작. 사용자가 직접 `/workflow-session-start` 호출 시 (또는 자동 read 시) baseline 복원을
*최소 effort* 로 시도:

1. `ai-workflow/memory/active/state.json` 부재 → 사용자에게 scaffold 제안
2. `PURPOSE.md` 부재 → 4-element placeholder + `init` light 호출 권장
3. `work_backlog.md` 부재 → 빈 인덱스 + 첫 task 등록 안내

## 프로젝트 실행 기본값

아래 명령은 2026-07-21 (TASK-125) 로컬 환경에서 **실행 검증된 값**이다. SSOT 는
`ai-workflow/memory/active/state.json` 의 `commands`.

- **install**: `pnpm install`
  - `Ignored build scripts: esbuild` 경고는 무해 (vitest / vite build 정상 통과 확인).
- **run (memory backend)**:
  `BUILD_REPOSITORY_BACKEND=memory node apps/build-server/dist/apps/build-server/src/index.js`
- **run (Postgres backend — default 개발 경로)**:
  `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/docker_image_builder BUILD_REPOSITORY_BACKEND=postgres node apps/build-server/dist/apps/build-server/src/index.js`
- **quick test**: 각 tsconfig 에 `tsc --noEmit` (shared-contract / shared-config / db /
  build-server) + `apps/build-monitor` 의 `tsc --noEmit -p tsconfig.react.json`
- **isolated test**:
  - frontend: `apps/build-monitor` 에서 `vitest run` → **133 PASS**
  - build-server: `apps/build-server` 에서 `node --import tsx --test tests/*.test.ts` → **172 PASS**
  - runner: `apps/runner` 에서 `go test ./...` → **8/8 package PASS**
- **smoke check**: 서버 기동 후 `GET /health` → `{"status":"ok"}`, `POST /builds`
  (필수 필드 `appName` / `requestedBy` / `entrypointPath` / `sourceArchive{objectKey,checksumSha256,sizeBytes}`),
  `GET /builds` 로 Postgres 왕복 확인
- **migration**: `apps/build-server` 에서
  `MIGRATIONS_DIR=migrations node --import tsx scripts/migrate.ts --list | --bootstrap | --dry-run`

### 환경 주의사항 (Windows 로컬)

- **PowerShell 에서는 `./node_modules/.bin/tsc` 형태가 그대로 동작하지 않는다.** Bash 셸을
  쓰거나 `.\node_modules\.bin\tsc` 로 바꿔 쓴다.
- **Postgres 포트는 로컬 native 설치 기준 `5432`.** 기존 문서 다수가 compose 매핑 기준
  `15432` 로 적혀 있으니 로컬 실행 시 `DATABASE_URL` 을 확인할 것.
- **실이미지 빌드 e2e (TASK-153, 2026-07-23 검증)**: 현재 Linux 개발 환경(Ubuntu 25.10)에는
  Docker 29.1.3 + compose v2 가 설치·구동 중이고 사용자가 `docker` 그룹 소속이라 `docker`
  가 sudo 없이 동작한다. `e2e-production-semantic.sh` (실제 `docker build` busybox + `docker
  run` + HTTP 200 + 10 phase + container cleanup) 가 **ALL PASS** 로 검증됨:
  ```bash
  export DOCKER_SOCKET_GID="$(getent group docker | cut -d: -f3)"; export ADMIN_IDS=admin
  bash apps/build-server/scripts/e2e-production-semantic.sh
  ```
  runner `RUNNER_DOCKER_BUILD_MODE` 기본값은 여전히 `skeleton` 이라 **단위 테스트는 Docker
  없이 통과**하고, 실제 이미지 빌드는 `cli` 모드(위 e2e / compose.dev.e2e-production.yaml)에서만
  탄다. **Docker 미설치 환경**(과거 Windows 로컬 등)에서는 `compose.dev.*.yaml` 기반 e2e 는
  실행 불가.
- **TASK-153 회귀 교훈 — 루트 `Dockerfile` 의 build-monitor 빌드는 `vite build --config
  vite.react.config.ts` 를 써야 한다.** config 미지정(`vite build`)은 확장자 우선순위(.js>.ts)로
  Svelte 잔재 `vite.config.js` 나 half-migrated `vite.config.ts`(루트 `index.html`→`/src/main.ts`)
  를 잡아 이미지 빌드가 깨진다. 이 두 잔재는 `.gitignore`/부분만 정리돼 있었고 `.dockerignore`
  에서 `vite.config.js` 를 빼먹어 build context 로 새 들어갔다. React SPA 는 root=`react/`,
  outDir=`dist-react` (→ 이미지에서 `dist/` 로 COPY). 이 회귀는 React 이관 후 실이미지 e2e 를
  한 번도 안 돌려 잠복해 있었다.
- **크로스플랫폼 주의 (TASK-126 교훈)**: tar entry 이름처럼 **항상 슬래시 구분자인 값**을
  다룰 때 `path/filepath` 를 쓰면 안 된다 — `filepath` 는 호스트 OS 규약을 따르므로
  Windows 빌드에서 Unix 절대경로(`/etc/passwd`)를 놓친다. 슬래시 기반 판정에는 `path` 를
  쓸 것. 이 결함은 Linux CI 에서는 green 이라 로컬 Windows 환경에서만 드러났다.

## 다음에 읽을 문서

- `ai-workflow/README.md` (kit 개요)
- `docs/PROJECT_PROFILE.md` (프로젝트 메타)
- `ai-workflow/memory/active/sessions` (현재 세션 인계)
- `harnesses/claude-code/apply_guide.md` (Claude Code 적용 절차)
