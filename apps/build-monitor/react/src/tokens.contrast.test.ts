// TASK-133 — 디자인 토큰 대비 가드 (A층, 다크/라이트 양 테마).
//
// 배경: TASK-132 의 최대 교훈은 "기본 테마가 다크인데 육안 검증이 라이트
// 기준으로만 이뤄져 대비 1.16:1 이 오래 잠복했다" 였다. 본 가드는 그 육안
// 검증을 양 테마 전수 기계 검증으로 대체한다.
//
// 착수 시점 실측으로 드러난 AA 위반 (전부 본 TASK 에서 해소):
//   dark  text-muted / canvas        3.65  (라이트는 TASK-046 에서 이미 교정)
//   dark  border-strong              1.72  (라이트는 3.28 로 교정돼 있었음)
//   dark  code-muted / code-bg       4.11
//   dark  StatusPill primary         3.51
//   dark  흰 글자 on amber 배지       2.15  → --dib-color-on-accent 도입으로 해소
//   light StatusPill warning         2.72
//   light StatusPill success         3.14
//   light StatusPill info            3.39
//   light StatusPill danger          3.81
//
// 임계값은 WCAG 2.2 AA 를 그대로 쓴다 (allowlist 없음 — 사용자 결정).

import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  fmt,
  mixOver,
  readThemes,
  resolveColor,
  type Rgb,
  type TokenMap
} from "./test/contrast";

/** WCAG 2.2 §1.4.3 — 일반 텍스트. */
const AA_TEXT = 4.5;
/** WCAG 2.2 §1.4.11 — 비텍스트 UI 컴포넌트 (테두리 등). */
const AA_NON_TEXT = 3.0;

/** StatusPill.tsx 의 `color-mix(in srgb, var(--dib-pill-color) 15%, transparent)`. */
const PILL_TINT_ALPHA = 0.15;

const THEMES = readThemes();
const THEME_NAMES = ["dark", "light"] as const;

/** 페이지에서 실제로 콘텐츠가 얹히는 배경 3종. */
const SURFACES = [
  "--dib-color-bg-canvas",
  "--dib-color-bg-surface",
  "--dib-color-bg-surface-elevated"
] as const;

/**
 * accent 토큰의 세 가지 역할.
 *
 * 하나의 토큰이 (1) 틴트 위 텍스트, (2) 솔리드 배경, (3) 중립 면 위 텍스트로
 * 동시에 쓰이기 때문에 세 역할을 각각 검사해야 한다. 다크에서는 (1) 과 (2) 가
 * 서로 반대 명도를 요구해 `--dib-color-on-accent` 분리로 해결했다.
 */
const ACCENTS = [
  "--dib-color-accent-primary",
  "--dib-color-accent-success",
  "--dib-color-accent-warning",
  "--dib-color-accent-danger",
  "--dib-color-accent-info"
] as const;

/** 솔리드 accent 배경 — `--dib-color-on-accent` 를 전경으로 얹는 곳. */
const SOLID_ACCENT_BACKGROUNDS = [
  ...ACCENTS,
  "--dib-color-accent-primary-hover"
] as const;

function color(tokens: TokenMap, name: string): Rgb {
  const resolved = resolveColor(tokens[name] ?? "", tokens);
  if (resolved === null) {
    throw new Error(`토큰 ${name} 을(를) 색으로 해석할 수 없습니다`);
  }
  return resolved;
}

/**
 * 대비 단언 — 실패 메시지에 테마 / 쌍 / 실측값 / 기준을 모두 담는다.
 *
 * 회귀가 났을 때 "어느 테마의 무엇이 몇 대 몇으로 떨어졌는지" 가 바로 보여야
 * 한다. TASK-132 는 그 정보가 없어서 실제 브라우저를 띄우고서야 원인을 알았다.
 */
function expectContrast(
  theme: string,
  label: string,
  actual: number,
  min: number
): void {
  expect(
    actual >= min,
    `[${theme}] ${label} — 대비 ${fmt(actual)}:1, 기준 ${min}:1 미달`
  ).toBe(true);
}

describe.each(THEME_NAMES)("디자인 토큰 대비 — %s 테마", (themeName) => {
  const tokens = THEMES[themeName];

  describe("본문 텍스트 (AA 4.5:1)", () => {
    // text-disabled 는 WCAG 1.4.3 의 inactive component 예외라 제외.
    // border-subtle 은 장식용 구분선이라 1.4.11 대상이 아니다.
    const textTokens = [
      "--dib-color-text-primary",
      "--dib-color-text-secondary",
      "--dib-color-text-muted"
    ] as const;

    for (const fg of textTokens) {
      for (const bg of SURFACES) {
        it(`${fg} on ${bg}`, () => {
          const ratio = contrastRatio(color(tokens, fg), color(tokens, bg));
          expectContrast(themeName, `${fg} on ${bg}`, ratio, AA_TEXT);
        });
      }
    }
  });

  describe("비텍스트 UI (AA 3:1)", () => {
    // border-strong 은 input / table 테두리로 쓰인다 (실사용처 8곳+).
    for (const bg of ["--dib-color-bg-canvas", "--dib-color-bg-surface"] as const) {
      it(`--dib-color-border-strong on ${bg}`, () => {
        const ratio = contrastRatio(
          color(tokens, "--dib-color-border-strong"),
          color(tokens, bg)
        );
        expectContrast(
          themeName,
          `--dib-color-border-strong on ${bg}`,
          ratio,
          AA_NON_TEXT
        );
      });
    }
  });

  describe("터미널 표면 (AA 4.5:1)", () => {
    // LogStream 이 code-fg / code-muted / code-phase 를 텍스트로 쓴다.
    // code-* 는 라이트 모드에서도 터미널 톤을 유지하므로 양 테마 동일.
    for (const fg of ["--dib-code-fg", "--dib-code-muted", "--dib-code-phase"] as const) {
      it(`${fg} on --dib-code-bg`, () => {
        const ratio = contrastRatio(
          color(tokens, fg),
          color(tokens, "--dib-code-bg")
        );
        expectContrast(themeName, `${fg} on --dib-code-bg`, ratio, AA_TEXT);
      });
    }
  });

  describe("StatusPill — accent 텍스트 on accent 15% 틴트 (AA 4.5:1)", () => {
    // 대비를 canvas 기준으로 재면 실제보다 후하게 나온다. StatusPill 의
    // 배경은 accent 자신을 15% 섞은 색이므로 전경과 배경이 같이 움직인다.
    for (const accent of ACCENTS) {
      for (const bg of ["--dib-color-bg-canvas", "--dib-color-bg-surface"] as const) {
        it(`${accent} on ${bg} 위 틴트`, () => {
          const fg = color(tokens, accent);
          const tint = mixOver(fg, color(tokens, bg), PILL_TINT_ALPHA);
          const ratio = contrastRatio(fg, tint);
          expectContrast(
            themeName,
            `StatusPill ${accent} (${bg} 위 틴트)`,
            ratio,
            AA_TEXT
          );
        });
      }
    }
  });

  describe("솔리드 accent 배경 위 전경 (AA 4.5:1)", () => {
    // .btn-primary / .admin-tab.active / .badge / .chip--active 가 accent 를
    // 솔리드 배경으로 쓰고 그 위에 --dib-color-on-accent 를 얹는다.
    //
    // 이 검사가 없던 시절 `color: white` 하드코딩이 다크 모드 amber 배지에서
    // 2.15:1 이었다 — 그리고 amber 를 어떻게 조정해도 흰 글자로는 4.5 에
    // 도달할 수 없다는 것이 --dib-color-on-accent 도입의 근거였다.
    for (const bg of SOLID_ACCENT_BACKGROUNDS) {
      it(`--dib-color-on-accent on ${bg}`, () => {
        const ratio = contrastRatio(
          color(tokens, "--dib-color-on-accent"),
          color(tokens, bg)
        );
        expectContrast(
          themeName,
          `--dib-color-on-accent on ${bg}`,
          ratio,
          AA_TEXT
        );
      });
    }
  });

  describe("중립 면 위 accent 텍스트 (AA 4.5:1)", () => {
    // .result-head.accepted / .duplicate 가 success / warning 을 텍스트로,
    // AdminAccessDenied 의 h1 이 danger 를 텍스트로 쓴다.
    for (const accent of ACCENTS) {
      for (const bg of ["--dib-color-bg-canvas", "--dib-color-bg-surface"] as const) {
        it(`${accent} 텍스트 on ${bg}`, () => {
          const ratio = contrastRatio(
            color(tokens, accent),
            color(tokens, bg)
          );
          expectContrast(
            themeName,
            `${accent} 텍스트 on ${bg}`,
            ratio,
            AA_TEXT
          );
        });
      }
    }
  });
});

describe("테마 대칭성", () => {
  // TASK-132 / TASK-133 의 근본 교훈: 한 테마만 검증되고 다른 테마가 방치되는
  // 비대칭이 사고를 만든다. 라이트 블록이 재정의해야 할 색 토큰을 빠뜨리면
  // 다크 값이 조용히 상속되므로 (예: 흰 배경에 다크용 회색) 여기서 잡는다.
  it("라이트 테마가 모든 색 토큰을 재정의한다", () => {
    const mustOverride = [
      ...SURFACES,
      "--dib-color-text-primary",
      "--dib-color-text-secondary",
      "--dib-color-text-muted",
      "--dib-color-text-disabled",
      "--dib-color-border-subtle",
      "--dib-color-border-strong",
      ...SOLID_ACCENT_BACKGROUNDS,
      "--dib-color-on-accent"
    ];

    const { dark, light } = THEMES;
    const notOverridden = mustOverride.filter(
      (token) => dark[token] === light[token]
    );

    expect(
      notOverridden,
      `라이트 테마가 재정의하지 않아 다크 값을 상속하는 토큰: ${notOverridden.join(", ")}`
    ).toEqual([]);
  });
});
