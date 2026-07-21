#!/usr/bin/env node
// TASK-133 — 테마별 실계산색 대비 가드 (B층).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 A층(vitest)으로 부족한가
// ─────────────────────────────────────────────────────────────────────────
// A층(react/src/tokens.contrast.test.ts)은 tokens.css 의 **선언값**을 본다.
// 그런데 TASK-132 의 P0 는 선언값이 멀쩡한 상태에서 발생했다 —
// `@astryxdesign/theme-neutral` 이 우리와 이름이 같은 토큰 3종을 재정의하고
// `<Theme>` 가 그 속성을 문서 루트에 붙여 하위 전체에 상속시키는 바람에,
// tokens.css 의 값이 **컴포넌트 위치에서** 덮였다. 그 결과 .brand 의 계산색이
// #171717 on #0b0c10 = 대비 1.16:1 (사실상 비가시) 이 됐다.
//
// 즉 선언값 검사로는 원리적으로 못 잡는다. 실제 브라우저에서 계산된 색을
// 재야만 잡힌다 — 그것이 본 스크립트다.
//
// 두 가지를 검사한다:
//   1) 토큰 하이재킹 — 브라우저가 계산한 토큰값이 tokens.css 의 **선언값**과
//      다르면 누군가 cascade 에서 덮은 것이다. 기준은 반드시 소스여야 한다.
//      문서 루트의 계산값을 기준으로 삼으면 안 된다 — Astryx 는 루트에
//      속성을 붙였으므로 루트도 함께 오염돼 차이가 사라진다 (아래 §1 주석).
//   2) 실제 대비 — 보이는 텍스트마다 계산된 전경색과 (투명도를 합성한)
//      실효 배경색으로 WCAG 대비를 계산한다. 원인이 무엇이든 결과를 잡는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 실행 전제
// ─────────────────────────────────────────────────────────────────────────
// - 앱이 떠 있어야 한다 (기본 http://127.0.0.1:3000).
//   docs/PROJECT_PROFILE.md §3 "단일 포트 reverse proxy" 블록 참조.
// - Chrome 이 설치돼 있어야 한다. playwright 번들 chromium 은 이 네트워크에서
//   cdn.playwright.dev 가 ETIMEDOUT 이라 받을 수 없으므로 `channel: "chrome"`
//   으로 설치된 Chrome 을 구동한다 (TASK-132 에서 확인된 방법).
//
// 사용:
//   node scripts/check-theme-contrast.mjs
//   node scripts/check-theme-contrast.mjs --url http://127.0.0.1:3000
//   node scripts/check-theme-contrast.mjs --routes /builds,/login
//   node scripts/check-theme-contrast.mjs --help

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TOKENS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../react/src/tokens.css"
);

const DEFAULT_URL = "http://127.0.0.1:3000";
const DEFAULT_ROUTES = ["/login", "/builds", "/build-request"];

/** 우리 디자인 토큰 — 하이재킹 여부를 확인할 대상. */
const WATCHED_TOKENS = [
  "--dib-color-text-primary",
  "--dib-color-text-secondary",
  "--dib-color-text-muted",
  "--dib-color-bg-canvas",
  "--dib-color-bg-surface",
  "--dib-color-accent-primary",
  "--dib-color-on-accent"
];

const AA_TEXT = 4.5;
const AA_LARGE_TEXT = 3.0;

function parseArgs(argv) {
  const args = { url: DEFAULT_URL, routes: DEFAULT_ROUTES, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--url") args.url = argv[++i];
    else if (arg === "--routes") args.routes = argv[++i].split(",");
    else {
      console.error(`알 수 없는 인자: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function usage() {
  console.log(`
테마별 실계산색 대비 가드 (TASK-133 B층)

  --url <origin>     검사 대상 origin (기본 ${DEFAULT_URL})
  --routes a,b,c     검사할 라우트 (기본 ${DEFAULT_ROUTES.join(",")})
  --help             이 도움말

종료 코드: 0 통과 / 1 위반 검출 / 2 사용법 오류 / 3 전제 미충족
`);
}

/**
 * tokens.css 의 선언값 — 하이재킹 판정의 기준(source of truth).
 *
 * A층(react/src/test/contrast.ts)과 같은 파싱을 하지만, 그쪽은 TypeScript 라
 * 본 .mjs 에서 직접 import 할 수 없어 최소한으로 중복한다. 두 층이 같은
 * 파일을 읽으므로 값이 갈릴 일은 없다.
 */
function readExpectedTokens(theme) {
  const css = readFileSync(TOKENS_PATH, "utf8");
  const parseBlock = (selector) => {
    const at = css.indexOf(selector);
    if (at === -1) throw new Error(`tokens.css 에 ${selector} 가 없습니다`);
    const open = css.indexOf("{", at);
    const close = css.indexOf("\n}", open);
    const out = {};
    for (const line of css.slice(open + 1, close).split("\n")) {
      const m = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  };
  const dark = parseBlock(":root {");
  return theme === "light"
    ? { ...dark, ...parseBlock(':root[data-theme="light"]') }
    : dark;
}

/**
 * 페이지 안에서 실행되는 감사 로직.
 *
 * 브라우저 컨텍스트로 직렬화되어 넘어가므로 외부 스코프를 참조하지 않는다.
 */
function auditInPage({ watchedTokens, expectedTokens, aaText, aaLarge }) {
  const parseRgb = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const parts = m[1].split(",").map((p) => Number.parseFloat(p.trim()));
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts.length > 3 ? parts[3] : 1
    };
  };

  const luminance = ({ r, g, b }) => {
    const ch = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };

  const contrast = (x, y) => {
    const [hi, lo] = [luminance(x), luminance(y)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  });

  /**
   * 실효 배경색 — 투명한 조상을 타고 올라가며 합성한다.
   *
   * 단순히 자기 backgroundColor 만 보면 대부분 transparent 라 검사가
   * 무의미해진다. TASK-132 의 .brand 도 배경이 자기 자신에 없었다.
   */
  const effectiveBackground = (el) => {
    const stack = [];
    let node = el;
    while (node && node !== document.documentElement.parentElement) {
      const style = getComputedStyle(node);
      // 그라디언트/이미지 배경은 단일 색으로 환원할 수 없다. 이 경우 아래쪽
      // 불투명 배경까지 계속 올라가면 실제와 전혀 다른 색을 잡는다 — 예를
      // 들어 로고 글리프는 indigo→sky 그라디언트 위에 있는데 그걸 건너뛰면
      // canvas 위에 있다고 오판한다. 측정 불가로 명시 보고한다.
      if (style.backgroundImage && style.backgroundImage !== "none") {
        return { indeterminate: true, reason: "그라디언트/이미지 배경" };
      }
      const bg = parseRgb(style.backgroundColor);
      if (bg && bg.a > 0) {
        stack.push(bg);
        if (bg.a >= 1) break;
      }
      node = node.parentElement;
    }
    if (stack.length === 0) return { r: 255, g: 255, b: 255, a: 1 };
    let acc = { ...stack[stack.length - 1], a: 1 };
    for (let i = stack.length - 2; i >= 0; i -= 1) acc = over(stack[i], acc);
    return acc;
  };

  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number.parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  // ── 1) 토큰 하이재킹 ────────────────────────────────────────────────
  //
  // 기준은 tokens.css 의 **선언값**이다. "문서 루트의 계산값" 을 기준으로
  // 삼으면 안 된다 — TASK-132 의 Astryx 는 `<Theme>` 가 문서 루트에
  // data-astryx-theme 를 붙였기 때문에 루트 자체가 이미 오염돼 있었고,
  // 루트와 하위가 사이좋게 같은 값을 갖는다. 실제로 이 스크립트의 초판이
  // 그 방식이었고, 사고를 재현해 돌려보니 대비 위반 7건은 잡으면서
  // 하이재킹은 0건으로 놓쳤다. 기준을 소스로 바꿔야 잡힌다.
  const normalize = (value) => value.trim().toLowerCase();
  const hijacks = [];
  const probes = [
    document.documentElement,
    ...Array.from(document.querySelectorAll("body *")).filter(isVisible)
  ];
  for (const [token, expected] of Object.entries(expectedTokens)) {
    if (!watchedTokens.includes(token)) continue;
    for (const el of probes) {
      const actual = getComputedStyle(el).getPropertyValue(token);
      if (actual && normalize(actual) !== normalize(expected)) {
        hijacks.push({
          token,
          rootValue: expected,
          localValue: actual.trim(),
          element:
            el === document.documentElement ? ":root (문서 루트)" : describe(el)
        });
        break; // 토큰당 첫 사례만 — 하위 전체가 같은 원인일 것이다
      }
    }
  }

  // ── 2) 실제 텍스트 대비 ────────────────────────────────────────────
  const violations = [];
  const skipped = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const text = textNode.nodeValue.trim();
    const el = textNode.parentElement;
    if (text && el && isVisible(el)) {
      const style = getComputedStyle(el);
      const fg = parseRgb(style.color);
      if (fg) {
        const bg = effectiveBackground(el);
        if (bg.indeterminate) {
          const key = `${describe(el)}|${text.slice(0, 24)}`;
          if (!seen.has(key)) {
            seen.add(key);
            skipped.push({
              element: describe(el),
              text: text.slice(0, 40),
              reason: bg.reason
            });
          }
          textNode = walker.nextNode();
          continue;
        }
        const composed = fg.a < 1 ? over(fg, bg) : fg;
        const ratio = contrast(composed, bg);
        const size = Number.parseFloat(style.fontSize);
        const weight = Number.parseInt(style.fontWeight, 10) || 400;
        const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
        const required = isLarge ? aaLarge : aaText;
        const key = `${describe(el)}|${text.slice(0, 24)}`;
        if (ratio < required && !seen.has(key)) {
          seen.add(key);
          violations.push({
            element: describe(el),
            text: text.slice(0, 40),
            ratio: Math.round(ratio * 100) / 100,
            required,
            fontSize: size,
            fontWeight: weight,
            color: style.color,
            background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`
          });
        }
      }
    }
    textNode = walker.nextNode();
  }

  return { hijacks, violations, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.error(
      "playwright-core 가 없습니다. `pnpm --filter @docker-image-builder-system/build-monitor add -D playwright-core` 로 설치하세요."
    );
    return 3;
  }

  let browser;
  try {
    // 번들 chromium 이 아니라 설치된 Chrome 을 쓴다 — 위 헤더 주석 참조.
    browser = await chromium.launch({ channel: "chrome" });
  } catch (error) {
    console.error(
      `Chrome 을 구동하지 못했습니다 (channel: "chrome"). Chrome 설치를 확인하세요.\n  ${error.message}`
    );
    return 3;
  }

  let failures = 0;
  let totalSkipped = 0;

  try {
    for (const theme of ["dark", "light"]) {
      for (const route of args.routes) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          // 기본 테마가 다크라는 점이 TASK-132 P0 가 잠복한 이유였다.
          // 두 테마를 대칭적으로 강제한다.
          colorScheme: theme === "light" ? "light" : "dark"
        });
        await context.addInitScript(
          (value) => window.localStorage.setItem("theme", value),
          theme
        );

        const page = await context.newPage();
        const target = new URL(route, args.url).toString();

        try {
          await page.goto(target, {
            waitUntil: "networkidle",
            timeout: 15000
          });
        } catch (error) {
          console.error(`✗ [${theme}] ${route} — 페이지 로드 실패: ${error.message}`);
          console.error(
            `  앱이 ${args.url} 에 떠 있는지 확인하세요 (PROJECT_PROFILE §3 단일 포트 블록).`
          );
          await context.close();
          return 3;
        }

        // SPA 가 실제로 렌더될 때까지. #app-react 가 비어 있으면 의미 없다.
        await page
          .waitForFunction(
            () => document.querySelector("#app-react")?.children.length > 0,
            { timeout: 10000 }
          )
          .catch(() => {});

        const { hijacks, violations, skipped } = await page.evaluate(
          auditInPage,
          {
            watchedTokens: WATCHED_TOKENS,
            expectedTokens: readExpectedTokens(theme),
            aaText: AA_TEXT,
            aaLarge: AA_LARGE_TEXT
          }
        );

        // 측정 불가 항목은 반드시 드러낸다. 조용히 건너뛰면 "전부 검사했다" 로
        // 읽히는데, 실제로는 그 자리가 사각지대다.
        totalSkipped += skipped.length;
        for (const s of skipped) {
          console.log(
            `  · [${theme}] ${route} 측정 불가 (${s.reason}) — ${s.element} "${s.text}"`
          );
        }

        const label = `[${theme}] ${route}`;
        if (hijacks.length === 0 && violations.length === 0) {
          console.log(`✓ ${label}`);
        } else {
          failures += hijacks.length + violations.length;
          console.log(`✗ ${label}`);
          for (const h of hijacks) {
            console.log(
              `    토큰 하이재킹 ${h.token}: 루트 "${h.rootValue}" → ${h.element} 위치 "${h.localValue}"`
            );
            console.log(
              "      서드파티 스타일이 같은 이름 토큰을 재정의했을 가능성 (TASK-132 P0 시그니처)"
            );
          }
          for (const v of violations) {
            console.log(
              `    대비 ${v.ratio}:1 < ${v.required}:1 — ${v.element} "${v.text}"`
            );
            console.log(
              `      ${v.color} on ${v.background}, ${v.fontSize}px/${v.fontWeight}`
            );
          }
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    console.log(`\n실패 ${failures}건 — 위 항목을 해소하세요.`);
    return 1;
  }
  console.log(
    `\n전 테마 × 전 라우트 통과 (토큰 하이재킹 0, 대비 위반 0, 측정 불가 ${totalSkipped}건).`
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
