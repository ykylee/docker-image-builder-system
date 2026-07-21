// TASK-133 테마별 시각 회귀 가드 — 색 계산 + tokens.css 파싱 헬퍼.
//
// 왜 있는가: TASK-132 의 P0 는 "기본 테마가 다크인데 육안 검증이 라이트
// 기준으로만 이뤄져" 대비 1.16:1 이 오래 잠복한 사건이었다. 이 모듈은 그
// 육안 검증을 기계 검증으로 대체하는 A층(정적)의 기반이다.
//
// A층의 한계 (중요): 본 모듈은 tokens.css 의 **선언값**만 본다. TASK-132 의
// 실제 P0 는 서드파티(Astryx)가 cascade 에서 같은 이름 토큰을 덮어써서
// 발생했으므로 선언값 검사로는 잡히지 않는다. 그 계열은 실제 계산색을 재는
// B층(scripts/check-theme-contrast.mjs)이 담당한다. 두 층은 서로를 대체하지
// 않는다.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = path.resolve(HERE, "..");
export const TOKENS_PATH = path.join(SRC_DIR, "tokens.css");

export type Rgb = readonly [number, number, number];
export type TokenMap = Readonly<Record<string, string>>;

/** tokens.css 의 한 셀렉터 블록에서 `--token: value;` 를 모두 뽑는다. */
function parseBlock(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at === -1) {
    throw new Error(`tokens.css 에 셀렉터 ${selector} 가 없습니다`);
  }
  const open = css.indexOf("{", at);
  const close = css.indexOf("\n}", open);
  const out: Record<string, string> = {};
  for (const line of css.slice(open + 1, close).split("\n")) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * 두 테마의 토큰 맵을 만든다.
 *
 * light 는 `:root` 를 상속한 뒤 `:root[data-theme="light"]` 로 덮는 실제
 * cascade 를 그대로 재현한다 — light 블록이 재정의하지 않는 토큰(예:
 * --color-text-primary 이외의 spacing/radius)은 dark 값이 그대로 쓰이므로,
 * 단순히 light 블록만 보면 실제와 다른 값을 검사하게 된다.
 */
export function readThemes(): { dark: TokenMap; light: TokenMap } {
  const css = readFileSync(TOKENS_PATH, "utf8");
  const dark = parseBlock(css, ":root {");
  const light = { ...dark, ...parseBlock(css, ':root[data-theme="light"]') };
  return { dark, light };
}

/** `#rrggbb` / `rgb()` / `rgba()` / `var(--other)` 를 RGB 로 해석. */
export function resolveColor(
  value: string,
  tokens: TokenMap,
  depth = 0
): Rgb | null {
  if (depth > 8) return null;
  const v = value.trim();

  const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(v);
  if (ref) {
    const next = tokens[ref[1]];
    return next === undefined ? null : resolveColor(next, tokens, depth + 1);
  }

  const hex6 = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex6) {
    const n = Number.parseInt(hex6[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const hex3 = /^#([0-9a-f]{3})$/i.exec(v);
  if (hex3) {
    const [r, g, b] = [...hex3[1]].map((c) => Number.parseInt(c + c, 16));
    return [r, g, b];
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(v);
  if (fn) {
    const parts = fn[1].split(",").map((p) => Number.parseFloat(p.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2]];
    }
  }

  return null;
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const ch = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG 2.x 대비비 (1..21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `color-mix(in srgb, <fg> <pct>%, transparent)` 가 불투명 배경 위에 올라간
 * 결과를 계산한다.
 *
 * StatusPill.tsx 가 정확히 이 형태로 배경을 만든다 — pill 대비를 canvas 기준
 * 으로 재면 실제보다 후하게 나오므로, 합성 배경을 그대로 재현해야 한다.
 */
export function mixOver(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha)
  ];
}

/** 소수 2자리 — 실패 메시지에서 실측값을 바로 읽을 수 있게. */
export function fmt(ratio: number): string {
  return ratio.toFixed(2);
}
