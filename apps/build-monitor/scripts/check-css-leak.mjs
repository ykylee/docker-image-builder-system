#!/usr/bin/env node
// TASK-146 — CSS 전역 유출 실측 가드.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 정적 lint(css-leak.test.ts)로 부족한가
// ─────────────────────────────────────────────────────────────────────────
// 정적 lint 는 **bare element 셀렉터**(라우트 CSS 의 `iframe {}` 등)를 잡는다.
// 그러나 우리 CSS 사고의 절반은 **일반 클래스명 충돌**이었다:
//   - TASK-140: 우리 `.card { max-width: 400px }` 가 Astryx CodeBlock(container=
//               "card" 일 때 literal `card` 클래스를 붙인다)을 덮어 로그 뷰어가
//               400px 로 잘림.
//
// `.card` 는 CSS 문법상 완벽히 정당한 셀렉터라 정적으로는 못 잡는다. Astryx
// 컴포넌트가 **런타임에** 어떤 클래스를 붙이는지는 실제 브라우저에서 렌더해야
// 알 수 있다. 그래서 이 가드는 실브라우저에서 "우리 CSS 의 클래스가 Astryx
// 컴포넌트 요소에 실제로 붙는가"를 검사한다.
//
// TASK-145 에서 이 검사 로직으로 globals `button { background: none }` 이 모든
// Astryx primary 버튼 배경을 없애던 회귀를 찾았다 — 그 실측을 재사용 가능한
// 가드로 남긴 것이다.
//
// ─────────────────────────────────────────────────────────────────────────
// 무엇을 검사하는가
// ─────────────────────────────────────────────────────────────────────────
// 1. 클래스 충돌 — 우리 CSS 가 선언한 클래스를 가진 요소가 **동시에 Astryx
//    클래스(astryx-* 또는 StyleX atomic x…)를 가지면** 우리 규칙이 Astryx
//    컴포넌트에 적용되고 있다는 뜻이다.
// 2. element 유출 — Astryx 의 <button>/<a>/<input> 이 우리 base reset 색/배경을
//    받고 있는지 (TASK-145 회귀의 직접 시그니처).
//
// ─────────────────────────────────────────────────────────────────────────
// 실행 전제
// ─────────────────────────────────────────────────────────────────────────
// - 앱이 떠 있어야 한다 (기본 http://127.0.0.1:3000).
// - Chrome 설치 필요 (번들 chromium 은 이 네트워크에서 CDN ETIMEDOUT).
//   B층 가드(check-theme-contrast.mjs)와 동일한 제약·방식이다.
//
// 사용:
//   node scripts/check-css-leak.mjs
//   node scripts/check-css-leak.mjs --routes /builds,/login
//   node scripts/check-css-leak.mjs --help
// 종료 코드: 0 통과 / 1 유출 검출 / 2 사용법 오류 / 3 전제 미충족

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { openOverlaysIfAny } from "./_overlay-trigger.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS_DIR = path.resolve(HERE, "../react/src");

const DEFAULT_URL = "http://127.0.0.1:3000";
// admin 라우트는 admin userId 를 심어 함께 검사한다 (Table/Dialog 사용처).
const DEFAULT_ROUTES = [
  "/login",
  "/builds",
  "/build-request",
  "/api-console",
  "/admin/builds",
  "/admin/runners"
];

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
CSS 전역 유출 실측 가드 (TASK-146)

  --url <origin>   검사 대상 origin (기본 ${DEFAULT_URL})
  --routes a,b,c   검사할 라우트 (기본 ${DEFAULT_ROUTES.join(",")})
  --help           이 도움말

종료 코드: 0 통과 / 1 유출 검출 / 2 사용법 오류 / 3 전제 미충족
`);
}

/**
 * react/src 의 모든 .css 에서 **단독 클래스 규칙**의 클래스명만 수집한다.
 *
 * "단독" 이 핵심이다 — TASK-140 의 사고는 `.card { max-width }` 처럼 우리가
 * **단독 클래스 셀렉터**로 선언한 규칙이 Astryx 요소(card 클래스를 가진)를
 * 덮은 것이다. 복합/자손 셀렉터(`.preset-btn.secondary`, `.foo .card`)는 그
 * 조상/형제 클래스가 함께 있어야 매칭되므로 Astryx 요소를 우연히 덮지 않는다.
 * 이걸 구분 안 하면 `.secondary`(우리는 `.preset-btn.secondary` 로만 씀)가
 * Astryx 요소의 secondary 클래스에 오탐으로 걸린다.
 *
 * 주석도 제거한다 — `DESIGN.md` 같은 텍스트의 `.md` 를 클래스로 오인하지 않게.
 */
function collectOurClasses() {
  const classes = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".css")) {
        let css = readFileSync(full, "utf8");
        css = css.replace(/\/\*[\s\S]*?\*\//g, ""); // 블록 주석 제거

        // 각 규칙의 셀렉터 부분(`{` 앞)을 쉼표로 나눠, **정확히 `.class` 또는
        // `.class:pseudo` 하나**로만 이뤄진 셀렉터의 클래스명을 수집한다.
        for (const block of css.split("}")) {
          const braceAt = block.indexOf("{");
          if (braceAt === -1) continue;
          const selector = block.slice(0, braceAt);
          for (const part of selector.split(",")) {
            const m = /^\s*\.([a-zA-Z][\w-]*)\s*(:{1,2}[\w-]+(\([^)]*\))?)?\s*$/.exec(
              part
            );
            if (m) classes.add(m[1]);
          }
        }
      }
    }
  };
  walk(CSS_DIR);
  return [...classes];
}

/**
 * 페이지 안에서 실행되는 검사 로직.
 *
 * 우리 클래스를 가진 요소가 Astryx 요소이기도 한지 + Astryx 폼/링크 요소가
 * 우리 base reset 을 받는지 확인한다.
 */
function auditInPage({ ourClasses, scope = null }) {
  const root = scope ? document.querySelector(scope) : document.body;
  if (scope && !root) {
    // 모달 scope 가 없으면 검사할 게 없다. 호출 측이 이미 경고를 출력한다.
    return [];
  }
  if (!root) return [];

  const isAstryxEl = (el) =>
    [...el.classList].some(
      (c) => c.startsWith("astryx-") || /^x[0-9a-z]{5,}$/.test(c)
    );

  const leaks = [];

  // 1) 클래스 충돌 — 우리 클래스가 Astryx 요소에도 붙어 있나.
  for (const cls of ourClasses) {
    let el;
    try {
      el = root.querySelector("." + CSS.escape(cls));
    } catch {
      continue;
    }
    if (el && isAstryxEl(el)) {
      leaks.push({
        kind: "class",
        detail: `.${cls} 가 Astryx 요소 <${el.tagName.toLowerCase()}> 에 붙음`
      });
    }
  }

  // 2) element 유출 — Astryx primary Button 이 배경을 잃었나 (TASK-145 시그니처).
  //    Astryx Button 은 variant 를 StyleX atomic 으로만 표현하고 data-variant
  //    를 안 붙인다. primary 를 마크업으로 골라낼 수 없으므로, **텍스트 컬러가
  //    on-accent(흰색/짙은색)인데 배경이 transparent 인 버튼**을 신호로 쓴다 —
  //    solid variant(primary/destructive)는 배경 위 대비색 글자를 쓰므로,
  //    배경이 없는데 글자가 대비색이면 배경이 유출로 사라진 것이다.
  //
  //    ghost/secondary 오탐을 피하려고 조건을 좁힌다: 배경 alpha 0 + 글자가
  //    거의 흰색이거나 거의 canvas 색(우리 --dib-color-on-accent 후보).
  for (const btn of root.querySelectorAll("button.astryx-button")) {
    const cs = getComputedStyle(btn);
    const bgm = cs.backgroundColor.match(/[\d.]+/g);
    const bgAlpha = bgm && bgm.length > 3 ? Number.parseFloat(bgm[3]) : 1;
    if (bgAlpha !== 0) continue; // 배경 있으면 정상

    // 글자색이 on-accent(흰색 ~ 또는 canvas 짙은색)면 solid 였어야 한다.
    const fg = (cs.color.match(/\d+/g) ?? []).map(Number);
    const nearWhite = fg[0] > 230 && fg[1] > 230 && fg[2] > 230;
    const nearCanvas = fg[0] < 30 && fg[1] < 30 && fg[2] < 35;
    if (nearWhite || nearCanvas) {
      leaks.push({
        kind: "element",
        detail: `Astryx Button "${btn.textContent.trim().slice(0, 20)}" 이 solid variant(대비색 글자)인데 배경이 없음 (우리 button reset 유출 의심)`
      });
    }
  }

  return leaks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return 0;
  }

  const ourClasses = collectOurClasses();

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
    browser = await chromium.launch({ channel: "chrome" });
  } catch (error) {
    console.error(
      `Chrome 을 구동하지 못했습니다 (channel: "chrome").\n  ${error.message}`
    );
    return 3;
  }

  let total = 0;
  try {
    for (const route of args.routes) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: "dark"
      });
      // admin 라우트도 검사하도록 admin userId 를 심는다.
      await context.addInitScript(() =>
        window.localStorage.setItem("userId", "yky.lee")
      );

      const page = await context.newPage();
      const target = new URL(route, args.url).toString();
      try {
        await page.goto(target, { waitUntil: "networkidle", timeout: 15000 });
      } catch (error) {
        console.error(`✗ ${route} — 로드 실패: ${error.message}`);
        console.error(`  앱이 ${args.url} 에 떠 있는지 확인하세요.`);
        await context.close();
        return 3;
      }
      await page
        .waitForFunction(
          () => document.querySelector("#app-react")?.children.length > 0,
          { timeout: 10000 }
        )
        .catch(() => {});

      // Register Runner 모달처럼 상호작용으로만 열리는 오버레이도 열어 검사한다.
      // TASK-148: 트리거 로직을 공용 helper 로 옮겼고, 모달을 새로 추가할 때
      // data-open-modal + MODAL_TRIGGERS 한 줄이면 된다.
      const overlayScope = await openOverlaysIfAny(page, route);

      const leaks = await page.evaluate(auditInPage, {
        ourClasses,
        scope: overlayScope ?? null
      });
      if (leaks.length === 0) {
        console.log(`✓ ${route}`);
      } else {
        total += leaks.length;
        console.log(`✗ ${route}`);
        for (const l of leaks) console.log(`    [${l.kind}] ${l.detail}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (total > 0) {
    console.log(
      `\n유출 ${total}건 — 우리 CSS 가 Astryx 컴포넌트를 덮고 있습니다.`
    );
    console.log(
      "  클래스 충돌: 페이지 루트 클래스로 스코프하거나 클래스명을 --dib 접두사로.\n" +
        "  element 유출: globals base reset 을 :not([class*=\"astryx-\"]) 로 제외."
    );
    return 1;
  }
  console.log("\n전 라우트 통과 (우리 CSS 가 Astryx 요소에 새지 않음).");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
