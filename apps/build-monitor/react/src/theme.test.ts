// TASK-136 — Astryx 테마와 우리 토큰의 브랜드 색 일치 가드.
//
// 이관이 끝날 때까지 두 체계가 공존한다:
//   - Astryx 컴포넌트는 `--color-accent` (theme.ts 의 defineTheme)
//   - 아직 이관 안 된 손 CSS 는 `--dib-color-accent-primary` (tokens.css)
//
// 두 값이 어긋나면 **같은 화면에 두 가지 인디고**가 보인다. 눈으로는 잘
// 안 잡히는 종류의 어긋남이라 (특히 한쪽 테마에서만 틀어지면 — TASK-132 의
// 교훈) 값 일치를 테스트로 고정한다.
//
// 이관이 끝나 손 CSS 가 사라지면 이 가드도 함께 사라진다.

import { describe, expect, it } from "vitest";

import { readThemes } from "./test/contrast";
import { BRAND_ACCENT } from "./theme";

describe("브랜드 색 단일 출처", () => {
  const { dark, light } = readThemes();
  const [brandLight, brandDark] = BRAND_ACCENT;

  it("light 브랜드 색이 tokens.css 와 일치한다", () => {
    expect(
      light["--dib-color-accent-primary"]?.toLowerCase(),
      "theme.ts 의 BRAND_ACCENT[0] 과 tokens.css 의 light " +
        "--dib-color-accent-primary 가 어긋나면 같은 화면에 두 가지 인디고가 보인다"
    ).toBe(brandLight.toLowerCase());
  });

  it("dark 브랜드 색이 tokens.css 와 일치한다", () => {
    expect(
      dark["--dib-color-accent-primary"]?.toLowerCase(),
      "theme.ts 의 BRAND_ACCENT[1] 과 tokens.css 의 dark " +
        "--dib-color-accent-primary 가 어긋나면 같은 화면에 두 가지 인디고가 보인다"
    ).toBe(brandDark.toLowerCase());
  });

  it("두 테마의 브랜드 색이 서로 다르다", () => {
    // 같은 값이면 한쪽 테마에서 대비가 무너진다 — TASK-133 이 실측으로
    // light #4f46e5 / dark #7e81f3 을 각각 맞춰 놓았다.
    expect(brandLight.toLowerCase()).not.toBe(brandDark.toLowerCase());
  });
});
