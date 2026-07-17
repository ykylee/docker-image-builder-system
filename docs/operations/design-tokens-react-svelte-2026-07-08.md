# Design Tokens (TASK-096)

- 작성일: 2026-07-08
- TASK: TASK-096 M4.5 Group B (StatusPill + 디자인 토큰 정합)
- 시리즈: frontend rewrite 후속 M4.5 2단계

## 의도

TASK-090 의 React StatusPill self-review 에서 padding/font-size/background-alpha 의 디자인 강화분이 Svelte StatusPill 의 baseline 과 미세하게 달라 양쪽 컴포넌트가 의미상 1:1 정합이 아니었음. 본 TASK 에서 React StatusPill 을 Svelte baseline 으로 통일.

## 비교표 (TASK-096 baseline 정렬)

| 디자인 토큰 | Svelte StatusPill (baseline) | React StatusPill (TASK-090 self-review) | React StatusPill (TASK-096 baseline 정렬 후) |
|---|---|---|---|
| padding | `4px var(--space-md)` | `6px var(--space-lg)` | `4px var(--space-md)` ✅ |
| font-size | `var(--size-xs)` | `var(--size-sm)` | `var(--size-xs)` ✅ |
| background alpha | 15% | 20% | 15% ✅ |
| border alpha | 30% | 35% | 30% ✅ |
| box-shadow alpha | 15% | 18% | 15% ✅ |
| box-shadow blur | 8px | 10px | 8px ✅ |
| border-radius | `var(--radius-pill)` | `var(--radius-pill)` | 동일 |
| text-transform | uppercase | uppercase | 동일 |
| letter-spacing | 0.05em | 0.05em | 동일 |

## 디자인 토큰 단일화 (후속 TASK — 본 TASK 범위 외)

본 TASK 에서 **StatusPill 디자인 토큰** 만 baseline 정렬했고, **디자인 토큰 시스템 자체** 의 단일화는 후속 TASK 에서 분리합니다:

- **현재 상태**:
  - Svelte 측 `apps/build-monitor/src/lib/tokens.css` — 자체 디자인 토큰 (dark/light 모드별 정의)
  - React 측 `apps/build-monitor/react/src/globals.css` — Astryx theme-neutral 의 디자인 토큰 사용 (별도 디자인 시스템)
  - 두 시스템은 **variable name** 은 공유하지만 (e.g. `--color-accent-success`), **실제 색상 값** 은 상이

- **후속 TASK** (예: TASK-096.5 또는 M4.6):
  - 디자인 토큰 단일화 — Svelte 측 tokens.css 의 디자인 토큰을 React Astryx theme 으로 통일? 또는 React 측 globals.css 의 토큰 정의를 추가?
  - 옵션 A: Svelte tokens.css 폐기 + React Astryx theme 으로 단일화. Svelte 컴포넌트 모두 React 로 마이그레이션 (M4.5 G 그룹) 후 최종 단계.
  - 옵션 B: 양쪽 디자인 시스템 병행 유지. 양쪽 시스템의 디자인 톤 차이가 시각적으로 인지될 수 있으나 운영 영향 ↓.
  - 옵션 C: 디자인 토큰만 통합 파일로 추출 (`apps/build-monitor/shared/design-tokens.css`) — 양쪽 시스템이 import. 두 시스템의 디자인 톤이 통일.

## TASK-096 결정 (옵션 비교)

- **A** (채택): React StatusPill 디자인 토큰만 Svelte baseline 으로 통일. 디자인 토큰 단일화는 후속 TASK.
- **B**: Svelte StatusPill 디자인 토큰을 React TASK-090 self-review 의 강화분으로 통일. Svelte 측 다른 컴포넌트 (PhaseTimeline, FilterChips 등) 의 디자인 토큰도 영향.
- **C**: 디자인 토큰 시스템 단일화 (옵션 A/B 의 디자인 토큰 시스템 자체 통일).

## 회귀 baseline

- TS 5 packages clean
- build-monitor vitest **204 → 214 PASS** (신규 10: StatusPill 9 case + 디자인 baseline 검증 1)
- svelte-check 0/1 (TASK-077 baseline 무해)
- build-server tests 동일 (영향 0)
- vite build:react 정상 (영향 0)
- vite build svelte 정상 (영향 0)

## M4.5 Group 시리즈 진행 상황

| Group | TASK | 상태 |
|---|---|---|
| A | TASK-095 Header / ThemeToggle / FilterChips | ✅ |
| **B** | **TASK-096 StatusPill + 디자인 토큰** | ✅ 본 TASK |
| C | TASK-097 Admin 진입점 (AdminTabs + AdminAccessDenied) | 🔄 |
| D | TASK-098 Admin 페이지 4종 | pending |
| E | TASK-099 Build / API 페이지 | pending |
| F | TASK-100 App.svelte router 단순화 | pending |
| G | TASK-101 NotFound + Svelte scaffold 일괄 정리 | pending |

## 후속 가능한 작업

- 디자인 토큰 단일화 (TASK-096.5 / M4.6) — Svelte tokens.css 와 React globals.css 의 디자인 토큰 시스템 통일
- TASK-097 Group C (Admin 진입점 React 마이그레이션)
