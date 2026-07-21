<!-- standard-ai-workflow-kit: v0.15.19-beta -->

# 문서 무결성 가드 (TASK-131)

- 문서 목적: 프로젝트 고유 문서가 workflow kit sync 등으로 조용히 유실되는 것을 막는 가드의 설계와 운영 절차를 기록한다.
- 범위: 가드 스크립트 사용법, 검출 원리, 임계값 조정, 우회 절차, 히스토리 스캔 결과
- 대상 독자: 운영자, 개발자, AI agent
- 상태: stable
- 최종 수정일: 2026-07-21
- 관련 문서: [PROJECT_PROFILE](../PROJECT_PROFILE.md), [CHANGELOG](../../CHANGELOG.md)

## 1. 왜 있는가

`b2cbe5e` (`chore(workflow): bulk sync — workflow kit + active state rev144`) 가
`docs/PROJECT_PROFILE.md` 를 **327줄 → 45줄** kit 템플릿 스켈레톤으로 덮어썼다. 유실분에는
TASK-102~113 이 쌓아 올린 §3.1~§3.12 / §4 / §5 / 운영 가이드 reference 전체가 들어 있었다.

문제는 유실 자체보다 **탐지 지연**이었다. 커밋 메시지에는
`docs/PROJECT_PROFILE.md: 프로젝트 메타 동기화` 라고만 적혀 있어서 302줄이 사라진 사실이
드러나지 않았고, TASK-121 · 122 · 123 세 TASK 가 그 위에서 진행됐다. TASK-124 에서야
`/workflow-session-start` 로 baseline 을 복원하다가 "봉인 기록은 §3.5 를 갱신했다는데 파일에
§3.5 가 없다" 는 모순으로 발견됐다.

workflow kit 의 sync 도구는 `ai-workflow/scripts/` 아래 **배포본**이라 거기를 고쳐도 다음 kit
업데이트에 다시 덮어써진다. 그래서 가드는 저장소 자신이 들고 있어야 한다.

## 2. 무엇을 보는가

이번 사고의 시그니처는 두 가지였고, 둘 다 기계적으로 검출 가능하다.

| 신호 | 사고 당시 실측 |
|---|---|
| 급격한 축소 | 327 → 45줄 = **86.2% 감소** |
| placeholder 회귀 | `TODO:` / `<...>` 마커 **2개 → 16개** |

두 번째 신호가 특히 중요하다. **줄 수가 그대로여도** 실제 내용이 템플릿 빈칸으로 바뀌면
잡힌다 — 실제로 이 신호가 아래 §5 의 두 번째 사고를 찾아냈다.

## 3. 사용법

```bash
scripts/check-doc-integrity.sh                 # staged 변경 검사 (pre-commit)
scripts/check-doc-integrity.sh --range A..B    # 커밋 범위 검사 (CI / 사후 조사)
scripts/check-doc-integrity.sh --install-hook  # pre-commit hook 설치
ALLOW_DOC_SHRINK=1 git commit ...              # 의도적 축소일 때 우회
```

종료 코드: `0` 통과 / `1` 위반 감지 / `2` 사용법 오류

### 보호 대상

프로젝트가 직접 축적한 문서만 대상으로 한다. `ai-workflow/` 아래 kit 배포본은 sync 로 통째로
갈리는 것이 **정상**이므로 제외한다.

- `docs/PROJECT_PROFILE.md`
- `docs/RELEASE_NOTES-*.md`
- `docs/operations/*.md`
- `CHANGELOG.md`
- `CLAUDE.md` / `AGENTS.md` / `GROK.md` / `MiniMax.md` (에이전트 진입점)

### 임계값 조정

| 환경변수 | 기본값 | 의미 |
|---|---|---|
| `DOC_SHRINK_PCT_LIMIT` | `50` | 이 비율을 넘게 줄면 차단 |
| `DOC_MIN_LINES` | `40` | 원본이 이보다 짧으면 축소 검사 생략 (짧은 문서는 비율이 과민) |
| `ALLOW_DOC_SHRINK` | `0` | `1` 이면 전체 검사 생략 |

50% 는 86% 사고를 놓치지 않으면서 문서 정리로 흔히 생기는 20~40% 축소는 통과시키는 지점으로
잡았다 (§5 의 오탐 측정 근거).

## 4. 운영 절차

1. **최초 1회** — 각 개발자가 `scripts/check-doc-integrity.sh --install-hook` 실행.
   `.git/hooks/` 는 커밋되지 않으므로 clone 마다 필요하다.
2. **차단됐을 때** — 먼저 diff 를 열어 유실이 의도한 것인지 확인한다. 대개는 sync 도구가
   덮어쓴 것이므로 `git checkout -- <path>` 로 되돌린 뒤 sync 를 다시 적용한다.
3. **의도적 축소일 때** — `ALLOW_DOC_SHRINK=1` 을 붙이고, **커밋 메시지에 왜 줄였는지 남긴다.**
   이번 사고의 핵심 교훈이 "커밋 메시지가 유실을 감췄다" 는 것이므로.
4. **kit bulk sync 직후** — `--range <sync 이전>..<sync 이후>` 로 한 번 훑는다.

## 5. 히스토리 스캔 결과 (2026-07-21)

가드를 저장소 전체 히스토리에 적용해 오탐률을 측정했다.

- 검사한 연속 커밋 쌍: **166**
- 차단: **2건** (오탐 0)

| 커밋 | 판정 |
|---|---|
| `9133aff..b2cbe5e` | TASK-124 가 이미 복구한 **알려진 사고** (PROJECT_PROFILE 86% 축소) |
| `1d05db3..9c069a9` | **미발견 사고 2호** — 아래 참조 |

### 미발견 사고 2호

`9c069a9` (`feat(workflow): apply claude-code + codex harness v0.11.25-beta overlay`,
2026-07-09) 가 `AGENTS.md` 의 실행 기본값 6줄(실제 명령 + 출처)을 `TODO:` placeholder 로
덮어썼다. **줄 수는 63 → 63 으로 변화가 없어** 축소 검사로는 잡히지 않고, placeholder 회귀
신호로만 검출됐다.

같은 커밋이 `docs/PROJECT_PROFILE.md` 참조를 존재하지 않는
`ai-workflow/memory/active/PROJECT_PROFILE.md` 로 바꿔놓기도 했다 (이후 `b2cbe5e` 에서 우연히
원복). 상태도 `stable` → `draft` 로 역행했다.

이 상태로 **12일간 방치**됐다. 그동안 `AGENTS.md` 를 진입점으로 읽는 에이전트는 실행 명령
자리에서 `TODO:` 만 보고 있었다. TASK-131 에서 실측 명령으로 복구했다.

## 6. 한계

- **staged 검사는 pre-commit hook 에 의존**한다. hook 을 설치하지 않은 환경, `--no-verify`,
  또는 도구가 직접 파일을 쓰고 커밋까지 하는 경로는 막지 못한다. `--range` 를 CI 에 넣으면
  그 구멍이 닫힌다 (후속 후보).
- **줄 수와 placeholder 개수라는 대리 지표**를 쓴다. 같은 줄 수로 내용만 통째로 바뀌고
  placeholder 도 늘지 않는 교체는 검출하지 못한다.
- 임계값 50% 는 이 저장소의 166 커밋 쌍에 대해 오탐 0 이었지만, 문서 구조가 크게 바뀌면
  재측정이 필요하다.

## 7. follow-up

- **CI 통합** — PR 마다 `--range origin/main..HEAD` 실행. hook 미설치 / `--no-verify` 우회를 덮는다.
- **kit sync 절차에 편입** — `ai-workflow/scripts/apply_harness_update.py` 계열 실행 직후
  `--range` 검사를 관례화.
- 같은 계열 drift: `apps/build-monitor/react/src/components/PhaseTimeline.tsx` 가
  shared-contract 의 9 phase 를 주석만 달고 수동 복제 중 (TASK-129 / TASK-130 참조).

## 8. 관련 문서

- `scripts/check-doc-integrity.sh` (가드 본체)
- TASK-124 (PROJECT_PROFILE 302줄 유실 복구) — `ai-workflow/memory/active/backlog/2026-07-21.md` §1
- TASK-129 / TASK-130 (서버-프론트 계약 drift 와 컴파일 타임 고정) — 같은 backlog §6 / §7
