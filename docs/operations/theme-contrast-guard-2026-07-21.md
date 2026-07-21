# 테마별 시각 회귀 가드 (TASK-133)

- 문서 목적: 다크/라이트 양 테마의 색 대비 회귀를 기계적으로 막는 2계층 가드의 원리, 사용법, 한계를 정리한다.
- 범위: A층 정적 토큰 검사 (vitest) + B층 실계산색 검사 (Playwright) + 본 TASK 가 해소한 AA 위반 목록
- 대상 독자: 개발자, AI agent, 디자인 토큰 변경자
- 상태: stable
- 최종 수정일: 2026-07-21
- 관련 문서: [PROJECT_PROFILE](../PROJECT_PROFILE.md), [문서 무결성 가드](doc-integrity-guard-2026-07-21.md)

## 1. 왜 있는가

TASK-132 의 P0 는 이런 사고였다.

`@astryxdesign/theme-neutral` 이 우리와 **이름이 같은 토큰 3종**을 재정의하고,
`<Theme>` 가 `data-astryx-theme="neutral"` 을 **문서 루트**에 붙여 하위 전체에
상속시켰다. 그 결과 `tokens.css` 의 값이 컴포넌트 위치에서 덮였고, 동시에 하위
`color-scheme` 이 `light dark` 가 되어 `light-dark()` 가 다크 모드에서도 light
분기를 골랐다. 브랜드명의 계산색은 `#171717` on `#0b0c10` = **대비 1.16:1** —
사실상 비가시였다.

**기본 테마가 다크라 첫 진입 화면이 이 상태였다.** 그런데 라이트 모드에서는
`#171717` 이 정상으로 보이기 때문에, 육안 검증이 라이트 기준으로만 이뤄지는 한
증상이 드러나지 않았다. 그래서 오래 잠복했다.

교훈은 두 가지다.

1. **한 테마만 검증되고 다른 테마가 방치되는 비대칭이 사고를 만든다.**
2. **주석의 단언을 실측 없이 신뢰하면 안 된다** — `tokens.css` 주석은 "Astryx
   토큰은 우리에게 영향 0" 이라 단언했고, 가장 많이 쓰는 텍스트 토큰에서 틀렸다.

본 가드는 그 육안 검증을 기계 검증으로 대체한다.

## 2. 왜 2계층인가

| 층 | 무엇을 보는가 | 잡는 것 | 못 잡는 것 |
|---|---|---|---|
| **A** (vitest) | `tokens.css` 의 **선언값** | 토큰 값을 잘못 고치는 회귀, 미정의 토큰 | cascade 하이재킹 |
| **B** (Playwright) | 브라우저의 **계산값** | 서드파티 override, 실제 렌더 대비 | (앱 기동 필요) |

**A층만으로는 TASK-132 의 P0 를 원리적으로 못 잡는다.** 그 사고는 선언값이
멀쩡한 상태에서 cascade 가 덮어써서 일어났기 때문이다. 반대로 B층은 앱을 띄워야
하므로 매 커밋마다 돌리기 어렵다. 두 층은 서로를 대체하지 않는다.

## 3. A층 — 정적 토큰 검사 (항상 실행)

```bash
cd apps/build-monitor && pnpm test          # 전체 216 PASS (기존 133 + 신규 83)
```

- `react/src/tokens.contrast.test.ts` (81 케이스) — 다크/라이트 **양 테마**에 대해:
  - 본문 텍스트 3종 × 배경 3종 → AA 4.5:1
  - `--color-border-strong` × 배경 2종 → 비텍스트 UI 3:1
  - 터미널 표면 (`--code-*`) → 4.5:1
  - **StatusPill** — accent 텍스트 on `color-mix(accent 15%, transparent)` 합성 배경
  - **솔리드 accent 배경 위 `--color-on-accent`**
  - 중립 면 위 accent 텍스트
  - **테마 대칭성** — 라이트가 재정의해야 할 색 토큰을 빠뜨리면 다크 값이 조용히
    상속되므로 별도로 검사한다
- `react/src/tokens.defined.test.ts` — `var(--x)` 로 참조되는 모든 토큰이 실제로
  정의돼 있는지. **폴백이 있어도 실패로 본다** (§6 참조).

임계값은 WCAG 2.2 AA 를 그대로 쓴다. **allowlist 는 없다.**

### 3.1 StatusPill 대비를 canvas 로 재면 안 되는 이유

`StatusPill.tsx` 의 배경은 `color-mix(in srgb, var(--pill-color) 15%, transparent)`
— 즉 **accent 자신을 15% 섞은 색**이다. 전경과 배경이 같이 움직이므로 canvas
기준으로 재면 실제보다 후하게 나온다. A층은 이 합성을 그대로 재현한다.

## 4. B층 — 실계산색 검사 (opt-in)

### 4.1 전제

- 앱이 떠 있어야 한다 (기본 `http://127.0.0.1:3000`). PROJECT_PROFILE §3
  "단일 포트 reverse proxy" 블록 참조.
- **Chrome 설치 필요.** playwright 번들 chromium 은 이 네트워크에서
  `cdn.playwright.dev` 가 ETIMEDOUT 이라 받을 수 없다. 그래서 의존성도
  `playwright-core` (브라우저 미포함) 를 쓰고 `channel: "chrome"` 으로 설치된
  Chrome 을 구동한다. TASK-132 에서 확인된 방법이다.

### 4.2 실행

```bash
cd apps/build-monitor
pnpm check:theme-contrast
pnpm check:theme-contrast -- --routes /builds,/login
pnpm check:theme-contrast -- --url http://127.0.0.1:3000
```

종료 코드: `0` 통과 / `1` 위반 검출 / `2` 사용법 오류 / `3` 전제 미충족
(앱 미기동 · Chrome 부재 · playwright-core 미설치).

### 4.3 무엇을 검사하는가

1. **토큰 하이재킹** — 브라우저가 계산한 토큰값을 `tokens.css` 의 **선언값**과
   비교한다. 다르면 누군가 cascade 에서 덮은 것이다.
2. **실제 텍스트 대비** — 보이는 텍스트 노드마다 계산된 전경색과, 투명한 조상을
   타고 올라가며 합성한 **실효 배경색**으로 WCAG 대비를 계산한다. 원인이
   무엇이든 결과를 잡는다.

### 4.4 기준을 "문서 루트의 계산값" 으로 삼으면 안 된다 — 실측으로 확인한 함정

본 스크립트의 **초판은 루트와 하위 요소의 토큰값을 비교**했다. 사고를 재현해
돌려보니 결과는 이랬다.

| 검출기 | 초판 결과 |
|---|---|
| 대비 위반 | **7건 검출** (브랜드 텍스트 1.04:1 — 실제 사고 1.16:1 과 같은 자리) |
| 토큰 하이재킹 | **0건 — 놓침** |

이유는 명확하다. Astryx 는 `<Theme>` 가 **문서 루트에** 속성을 붙였으므로 루트
자체가 이미 오염돼 있었고, 루트와 하위가 사이좋게 같은 값을 가졌다. 차이가
없으니 검출되지 않는다.

기준을 `tokens.css` 선언값으로 바꾼 뒤 재현하면:

```
하이재킹 검출: 2 건
  --color-text-primary:   선언 "#f8f9fa" → :root (문서 루트) 계산 "#171717"
  --color-text-secondary: 선언 "#a0a8b4" → :root (문서 루트) 계산 "#404040"
대비 위반 검출: 7 건
  1.04:1 — span.title "Build Monitor"
```

> **가드를 만들었다고 가드가 동작하는 것은 아니다.** 실제 사고를 재현해
> 돌려보기 전까지는 알 수 없다. TASK-130 의 "타입을 도입한 것과 타입이 실제로
> 잡는 것은 다르다" 와 같은 교훈이다.

## 5. 본 TASK 가 해소한 AA 위반

착수 시점 실측. TASK-046 이 라이트 모드만 교정하고 **다크 동등물이 없던 비대칭**이
그대로 드러났다 — `tokens.css` 주석도 라이트 수정만 기록하고 있었다.

| 테마 | 대상 | 이전 | 이후 | 조치 |
|---|---|---|---|---|
| dark | `text-muted` (최악 배경 기준) | 3.65 | 4.52 | `#646b79` → `#7d8593` |
| dark | `border-strong` | 1.72 | 3.01 | `#333a4d` → `#566282` |
| dark | `code-muted` | 4.11 | 4.53 | `#64748b` → `#6a7b93` |
| dark | StatusPill primary | 3.51 | 4.50 | `#6366f1` → `#7e81f3` |
| dark | StatusPill danger | 4.18 | 4.54 | `#ef4444` → `#f15656` |
| dark | 흰 글자 on amber 배지 | 2.15 | 9.10 | `--color-on-accent` 도입 |
| light | StatusPill warning | 2.72 | 4.51 | `#d97706` → `#945104` |
| light | StatusPill success | 3.14 | 4.50 | `#059669` → `#04704e` |
| light | StatusPill info | 3.39 | 4.51 | `#0284c7` → `#02679c` |
| light | StatusPill danger | 3.81 | 4.51 | `#dc2626` → `#bb1e1e` |
| light | `.result-head.duplicate` | 2.91 | 5.58 | 위 warning 조정으로 동시 해소 |

### 5.1 `--color-on-accent` 를 도입한 이유

`--color-accent-*` 하나가 **세 역할**을 겸하고 있었다:

1. 틴트 위 pill 텍스트 → 다크에선 밝아야, 라이트에선 진해야
2. 솔리드 배경 + 전경 텍스트 (`.btn-primary` / `.admin-tab.active` / `.badge` / `.chip--active`)
3. 중립 면 위 텍스트 (`.result-head` / AdminAccessDenied)

라이트는 세 요구가 **같은 방향**(어둡게)이라 명도 조정만으로 동시에 풀린다.
다크는 1 과 2 가 정면 충돌한다. 게다가 **흰 글자 on 앰버는 어떤 명도로도 4.5 에
도달할 수 없다** — 앰버는 본질적으로 밝은 색이라 흰 글자와 공존이 불가능하다
(최대 2.15:1). 같은 앰버 위에 canvas 색을 얹으면 9.10:1 로 여유롭게 통과한다.

즉 다크의 실패는 색 선택이 아니라 **`color: white` 하드코딩**(15곳)이 원인이었다.
전경색을 테마별 토큰으로 분리해 해소했다.

```css
:root                      { --color-on-accent: #0b0c10; }  /* 다크 */
:root[data-theme="light"]  { --color-on-accent: #ffffff; }  /* 라이트 */
```

**시각 변화**: 다크 모드에서 primary 버튼 / 활성 탭 / 배지의 글자가 흰색 →
짙은 색으로 바뀐다. 기본 테마가 다크이므로 첫 화면에서 보이는 변화다.

### 5.2 가드가 즉시 찾아낸 것 — 미정의 토큰 9곳

`tokens.defined.test.ts` 를 처음 돌리자마자 `RegisterRunnerModal.css` 가 걸렸다.

```css
color:  var(--color-text, #f0f0f0);    /* --color-text 는 존재하지 않음 */
border: 1px solid var(--color-border, #444);  /* --color-border 도 없음 */
```

TASK-132 는 이 **같은 파일**의 `--color-bg-elevated` / `--color-bg-input` 을
고치면서 `--color-text` / `--color-border` 는 놓쳤다 (수동 grep 의 한계).
폴백 `#f0f0f0` 는 거의 흰색인데 `.modal` 배경은 `--color-bg-surface-elevated`
(라이트 `#dde4ed`) 이므로, **라이트 모드에서 이 모달만 글자가 안 보이는 상태**로
남아 있었다. 9곳 전부 실제 토큰으로 매핑해 해소했다.

## 6. 폴백이 있어도 실패로 보는 이유

`var(--없는토큰, #5b8def)` 는 오류를 내지 않는다. 그러나 **테마가 바뀌어도 색이
고정**되므로, 정확히 TASK-132 P3 가 겪은 증상(라이트 모드에서 모달만 검정)을
만든다. 조용히 동작하는 것이 더 나쁘다.

## 7. 한계

- **A층은 cascade 를 못 본다.** 선언값만 검사한다. 서드파티 override 계열은
  B층 없이는 잡히지 않는다.
- **B층은 앱 기동 + Chrome 설치가 전제**라 CI 이식성이 낮다. 현재 opt-in.
- **그라디언트/이미지 배경 위 텍스트는 측정 불가**로 건너뛴다 (현재 로고 글리프
  6건). 단일 색으로 환원할 수 없기 때문이다. **건너뛴 항목은 매 실행마다 출력**
  하고 요약에 건수를 찍는다 — 조용히 넘기면 "전부 검사했다" 로 오독된다.
- **검사 라우트는 기본 3종** (`/login` `/builds` `/build-request`). admin 라우트는
  인증이 필요해 기본값에서 제외했다 — `--routes` 로 지정 가능.
- **호버/포커스/비활성 상태는 검사하지 않는다.** 정적 렌더 상태만 본다.
- `--color-text-disabled` 는 WCAG 1.4.3 의 inactive component 예외라 **의도적으로
  제외**했다 (다크 1.97 / 라이트 2.64).

## 8. follow-up

- **B층 CI 통합** — 앱을 띄우는 단계가 필요하다. 문서 무결성 가드의 `--range`
  CI 통합과 같은 계열의 이월 항목.
- **디자인 토큰 네임스페이스 `--dib-*`** — 본 TASK 는 하이재킹을 *검출*할 뿐
  *차단*하지는 못한다. 접두사를 붙이면 이름 충돌 자체가 구조적으로 사라진다.
  `@astryxdesign/*` 의존성 2종이 (사용처 0건이지만) **여전히 남아 있으므로**
  재도입 시 필수다.
- **호버/포커스 상태 검사 확장**.
- Astryx 의존성 정리 여부 — 사용처 0건. 유지 결정은 재도입 가능성 때문 (사용자 결정).
