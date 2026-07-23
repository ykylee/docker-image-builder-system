# e2e + 시각 QA 의 CI/nightly 통합 (TASK-156)

- 문서 목적: e2e 13종과 build-monitor 시각 QA 를 nightly / main push / 수동 트리거로 자동 실행하는 구성 — wrapper 스크립트, 워크플로, baseline 정책, 한계.
- 범위: `scripts/run-e2e-suite.sh` / `scripts/run-visual-check.sh` / `.github/workflows/nightly-e2e.yml` + 기존 CI 워크플로와의 역할 분담
- 대상 독자: 개발자, AI agent, 운영자
- 상태: stable
- 최종 수정일: 2026-07-23
- 관련 문서: [CI 통합(B층)](ci-integration-2026-07-22.md), [시각 QA baseline](build-monitor-ui-visual-2026-07-22.md), [Release Notes v0.2.1](../RELEASE_NOTES-2026-07-23.md)

## 1. 왜 하는가

`v0.2.1` 에서 수정한 **프로덕션 결함 2건이 모두 "e2e 를 안 돌리면 잠복한다"** 는 같은 결의 사각지대였다.

| 결함 | 잠복 기간 | 드러난 계기 |
|---|---|---|
| 루트 `Dockerfile` 의 build-monitor 빌드 파손 (TASK-153) | React 이관 ~ `v0.2.0` | 실이미지 e2e 최초 실행 |
| chunked 업로드 build 가 runner 에게 영원히 claim 되지 않음 (TASK-155) | TASK-106 ~ `v0.2.0` | 같은 e2e 를 `--build` 붙여 재실행 |

단위 테스트(frontend 277 / build-server 181 / go 8 pkg)와 PR 정적 가드가 전부 green 이어도 **프로덕션 경로(이미지 빌드 · 실 claim · 실 컨테이너 기동)는 별개**다. 게다가 두 번째 결함은 해당 e2e 가 `--build` 없이 **몇 주 된 이미지만 검증**하고 있어서 e2e 를 "돌리고 있었는데도" 안 잡혔다.

→ e2e 를 nightly 에 고정하고, 시각 QA 도 함께 자동화한다.

## 2. 워크플로 역할 분담

| 워크플로 | 트리거 | 검사 | 도커 |
|---|---|---|---|
| `docker-build.yml` | PR + main push | 정적 가드 + 이미지 build/smoke | build 만 |
| `nightly-b-layer.yml` | nightly **03:00 UTC** + main push(경로) + 수동 | 실브라우저 대비/CSS 유출 + 문서 무결성 | compose.ci |
| **`nightly-e2e.yml`** (본) | nightly **04:00 UTC** + main push(경로) + 수동 | **e2e 13종 + 시각 QA** | 실사용(compose.dev) |

nightly 시각을 1시간 띄운 이유는 두 워크플로가 같은 러너 자원(도커)을 동시에 잡지 않게 하기 위함이다.

## 3. `scripts/run-e2e-suite.sh`

e2e 는 B층 가드와 달리 **호스트에서 `docker compose` 를 직접 구동**하므로 `compose.ci.yaml` 의 `guard` container 안이 아니라 러너 호스트에서 돈다.

### 3.1 그룹

| 그룹 | 종수 | 내용 | 신호 강도 |
|---|---|---|---|
| `local` | 5 | build-server 를 dist 로 부팅 (source-archive ×2 / chunked ×2 / single-port) | 강 |
| `compose` | 6 | docker compose 스택 (production-semantic ×2 / multi-runner ×3 / insecure-registry) — **실이미지 build/run 포함** | 강 |
| `runner` | 2 | runner 바이너리 기반 (container-run / deploy-push) | **약 — §6 참고** |
| `all` | 13 | 위 전부 (default) | |

### 3.2 wrapper 가 책임지는 것

- **env 정규화** — `DOCKER_SOCKET_GID`(getent 자동 유도) / `ADMIN_IDS` / `PGPORT` / `DIBS_POSTGRES_HOST_PORT` / `DATABASE_URL`.
- **전제 점검** — docker daemon, build-server dist, dist-react, postgres 접속. 부족하면 exit 3 으로 조기 실패(무의미한 e2e 실행 방지).
- **`docker_image_builder` DB 자동 생성** — 없으면 만든다.
- **`runner-bin` 자동 빌드** — 없으면 `go build` 한다. **이게 없으면 runner e2e 가 가짜 PASS 가 되기 때문**(§6).
- **스크립트 간 잔재 정리** — 각 e2e 실행 직전 `dibs-*` 컨테이너를 제거한다. 고정 project name 을 쓰는 스크립트가 있어 잔재가 있으면 이름 충돌로 연쇄 실패한다(TASK-155).
- **fail-open** — 첫 실패에서 멈추지 않고 전부 돌린 뒤 요약한다(`--stop-on-fail` 로 변경 가능).

### 3.3 사용

```bash
bash scripts/run-e2e-suite.sh                  # all (기본)
bash scripts/run-e2e-suite.sh --group compose  # compose 6종만
bash scripts/run-e2e-suite.sh --group local --stop-on-fail
```

종료 코드: `0` 전부 PASS / `1` 1건 이상 FAIL / `2` 사용법 / `3` 전제 미충족.

실측 소요(로컬, 2026-07-23): **13종 388초** — local 19s + compose 272s + runner 97s.

## 4. `scripts/run-visual-check.sh`

build-server(memory) + vite dev 를 띄우고 `capture.py` 로 20 PNG 를 캡처한 뒤 검증한다.

### 4.1 기본 검증 — baseline 불요

커밋된 baseline 이 없어도 유효한 4가지를 본다:

1. **라우트 셋 완전성** — `capture.py` 의 `ROUTES` 를 **단일 출처로 파싱**해 전부 캡처됐는지 확인. 라우트가 추가됐는데 캡처가 빠지면 잡힌다.
2. **산출물 무결성** — 0 byte PNG 없음.
3. **테마 분리** — 각 라우트의 `dark.png` ≠ `light.png`. 테마 토큰이 붕괴하면 두 파일이 같아진다(TASK-152 의 핵심 신호, TASK-132 의 재발 방지).
4. **오버레이 포함** — `admin-runners` 의 `*-modal.png` ≠ base. 모달이 안 열리면 같아진다(TASK-148).

### 4.2 선택 검증 — baseline 픽셀 diff

```bash
bash scripts/run-visual-check.sh --baseline apps/build-monitor/tests/visual/baseline
```

`--baseline` 이 주어지고 그 안에 PNG 가 있을 때만 `diff.py` 를 돌린다. 없으면 경고만 남기고 건너뛴다.

## 5. baseline 정책 (미결 항목)

TASK-152 의 baseline PNG 는 binary 라 `.gitignore` 로 git 에서 제외돼 있고, **외부 LFS/저장소 동기화 정책이 아직 미결**이다. 따라서 CI 에는 커밋된 baseline 이 없다.

현재 구성:
- CI 기본 = **구조 검증**(§4.1) — baseline 없이도 실질적 회귀를 잡는다.
- 캡처한 PNG 는 **artifact 로 업로드**(보존 14일) — 사람이 눈으로 확인 가능.
- LFS 정책이 정해지면 워크플로의 visual 스텝에 `--baseline` 을 붙이면 끝.

## 6. 한계 — runner 그룹의 신호가 약하다

`apps/runner/scripts/e2e-{container-run,deploy-push}.sh` 는 이름 그대로 **smoke** 다. 내부적으로

```
[5/7] docker ps confirmation
  ! container not running — healthcheck may have failed; ...
[6/7] Build Server state readback
  ! testDeployment.hostPort not yet populated ...
e2e container-run smoke: PASS
```

처럼 **컨테이너가 안 떠도 경고만 찍고 PASS** 한다. 즉 이 그룹의 PASS 는 "plumbing 이 살아있다" 수준의 신호이지 컨테이너 기동 보증이 아니다.

- 회귀 검출의 주력은 `local` / `compose` 그룹이다. 실제 컨테이너 기동·HTTP 200·10 phase 검증은 `compose` 그룹의 `e2e-production-semantic*.sh` 가 담당한다.
- 더 나쁜 것은 **`runner-bin` 이 없으면 runner 가 아예 안 뜨는데도 PASS** 한다는 점이다. wrapper 가 `go build` 를 대신 해주는 이유가 이것이다.
- **후속 후보**: 이 두 스크립트의 단언을 강화(컨테이너 기동/hostPort 를 hard fail 로)하거나, smoke 임을 이름/문서에 더 분명히 하는 것.

### 6.1 그 외 한계

- **모달 픽셀 diff 는 흔들린다.** 실측에서 `admin-runners/dark-modal.png` 이 ratio 0.0017 (> 0.001) 로 초과했다. Dialog 의 애니메이션/합성 타이밍 때문으로 보인다. baseline diff 를 켤 때는 모달에 별도 threshold 를 주거나 제외하는 것을 검토할 것.
- **호스트 포트 충돌**: GHA 의 postgres service 가 5432 를 점유하므로 compose 의 postgres 는 `DIBS_POSTGRES_HOST_PORT=15432` 로 옮겨 publish 한다(TASK-154 의 override). 로컬에 native postgres 가 있는 개발 환경도 동일.
- **비용**: nightly + 관련 경로 main push + 수동만 돌고 PR 에는 붙지 않는다 → PR 시간 영향 0.

## 7. 실패 시 대응

1. **artifact 확인** — `e2e-logs-<run_id>` 에 각 e2e 의 전체 로그가 있다. wrapper 가 실패한 스크립트의 마지막 12줄을 잡 로그에도 직접 찍는다.
2. **분류** — (a) 우리 코드 회귀 (b) e2e 스크립트 자체 결함 (c) 환경/타이밍. TASK-154/155 의 경험상 (b) 가 드물지 않다.
3. **로컬 재현** — `bash scripts/run-e2e-suite.sh --group <실패 그룹>`. 잔재가 의심되면 먼저 `docker rm -f $(docker ps -aq --filter name=dibs-)`.
4. **teardown** — 워크플로는 `if: always()` 로 `dibs-*` 컨테이너/볼륨을 정리한다.

## 8. 한 줄 요약

PR = 정적(빠름) / nightly 03:00 = 실브라우저 가드 / **nightly 04:00 = e2e 13종 + 시각 QA(실이미지 build·run 포함)**. v0.2.1 의 결함 2건이 잠복했던 사각지대를 자동 검출로 덮는다.
