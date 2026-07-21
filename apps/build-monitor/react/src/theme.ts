// TASK-136: Astryx 테마 정의 — 브랜드 색만 이식.
//
// 결정 (사용자): **브랜드 색만 이식하고 나머지는 Astryx neutral 을 따른다.**
//
// 근거: 텍스트/배경/테두리 대비와 상태색은 업스트림이 접근성을 검증해 유지하는
// 영역이다. 우리가 그것까지 이식하면 Astryx 컴포넌트 조합 안에서의 접근성을
// 계속 우리가 책임져야 하고, 버전이 오를 때마다 토큰 이름 변경을 추적해야 한다.
// 이식하는 토큰이 적을수록 pre-1.0 churn 에 덜 흔들린다.
//
// 그래서 여기서 덮는 것은 **브랜드 식별성**에 해당하는 것만이다. neutral 의
// 기본 `--color-accent` 는 `light-dark(#262626, #ebebeb)` 로 사실상 무채색이라,
// 이것만 인디고로 바꿔도 앱 인상이 유지된다.
//
// ── 우리 tokens.css 와의 관계 ──────────────────────────────────────────
// `--dib-*` 토큰(tokens.css)은 **아직 살아 있다.** 이관이 끝나지 않은 손 CSS
// 2,000여 줄이 그것을 쓰기 때문이다. 두 체계는 이관이 끝날 때까지 공존하며,
// 값의 단일 출처는 아래 BRAND 상수다 — tokens.css 의 accent 값과 어긋나면
// 같은 화면에서 두 가지 인디고가 보이므로, 회귀 테스트로 일치를 고정한다
// (theme.test.ts).

import { defineTheme } from "@astryxdesign/core/theme";

/**
 * 브랜드 인디고 — `[light, dark]` 튜플.
 *
 * 값의 출처는 tokens.css 의 `--dib-color-accent-primary` 이며, TASK-133 에서
 * 양 테마 WCAG AA 를 실측해 맞춘 값이다:
 *   light `#4f46e5` — StatusPill 틴트 위 4.61:1 / 흰 글자 위 6.29:1
 *   dark  `#7e81f3` — StatusPill 틴트 위 4.50:1
 *
 * 이 값을 바꿀 때는 tokens.css 도 함께 바꿔야 한다 (theme.test.ts 가 고정).
 */
export const BRAND_ACCENT: readonly [light: string, dark: string] = [
  "#4f46e5",
  "#7e81f3"
];

export const dibTheme = defineTheme({
  name: "dib",
  tokens: {
    "--color-accent": [...BRAND_ACCENT]
  }
});
