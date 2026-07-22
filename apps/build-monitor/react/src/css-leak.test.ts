// TASK-145: CSS 전역 유출 lint (정적).
//
// ── 배경 ──────────────────────────────────────────────────────────────
// 우리 CSS 는 Astryx 의 @layer 보다 우선하는 **unlayered** 다. 그래서 스코프
// 없는 규칙이 Astryx 컴포넌트를 예상치 못하게 덮는 사고가 반복됐다:
//   - TASK-138: Login.css 의 bare `label {}` / `input {}` 이 앱 전체 입력을 덮음
//   - TASK-140: Login.css 의 `.card { max-width }` 가 Astryx CodeBlock(card 클래스)
//               을 덮어 로그 뷰어가 400px 로 잘림
//   - TASK-145: globals.css 의 bare `button { background: none }` 이 **모든 Astryx
//               primary Button 의 배경을 없앰** (Submit Build / Register 가 배경 없이
//               렌더됨을 실측으로 발견)
//
// unlayered × element 셀렉터의 조합이 특히 위험하다 — element 셀렉터는 클래스
// 없이 태그 전체(Astryx 의 <a>/<button>/<input> 포함)에 적용되고, unlayered 라
// specificity 로도 못 막는다.
//
// ── 이 lint 가 막는 것 ────────────────────────────────────────────────
// 라우트/컴포넌트 CSS(globals.css 제외)에서 **bare element 셀렉터**를 금지한다.
// globals.css 의 base reset 은 정당하지만, 거기서도 Astryx 요소를 덮지 않도록
// `:not([class*="astryx-"])` 로 제외했는지 확인한다.
//
// 실제 충돌(우리 규칙이 Astryx 요소에 붙는가)은 정적으로 판정 불가하므로
// `scripts/check-css-leak.mjs`(실브라우저)가 담당한다. 이 lint 는 1차 방어다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url))
);

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out;
}

/** CSS 문법 키워드 — element 셀렉터가 아니다. */
const NON_SELECTOR_KEYWORDS = new Set(["from", "to"]);

/** 최상위 셀렉터가 element(태그)로 시작하는지 — 주석/미디어쿼리/keyframe 제외. */
function bareElementSelectors(css: string): string[] {
  const found: string[] = [];
  // @keyframes 블록 안의 `from {` / `to {` / `50% {` 는 셀렉터가 아니라
  // keyframe 스텝이다. 중괄호 깊이로 keyframes 컨텍스트를 추적해 제외한다.
  let inKeyframes = false;
  let keyframesDepth = 0;
  let depth = 0;

  for (const raw of css.split("\n")) {
    const line = raw.trim();

    if (/^@keyframes\b/.test(line)) {
      inKeyframes = true;
      keyframesDepth = depth;
    }
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    const skip =
      line.startsWith("*") ||
      line.startsWith("/*") ||
      line.startsWith("//") ||
      line.startsWith("@") ||
      line.startsWith(".") ||
      line.startsWith("#") ||
      line.startsWith(":") ||
      line.startsWith("}") ||
      inKeyframes;

    if (!skip) {
      const m = /^([a-zA-Z][a-zA-Z0-9]*(\s*,\s*[a-zA-Z][a-zA-Z0-9]*)*)\s*\{/.exec(
        line
      );
      if (m && !NON_SELECTOR_KEYWORDS.has(m[1])) found.push(m[1]);
    }

    depth += opens - closes;
    if (inKeyframes && depth <= keyframesDepth) inKeyframes = false;
  }
  return found;
}

describe("CSS 전역 유출 방지", () => {
  const files = cssFiles(SRC_DIR);
  const GLOBALS = "globals.css";

  it("라우트/컴포넌트 CSS 에 bare element 셀렉터가 없다", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (path.basename(file) === GLOBALS) continue; // base reset 은 별도 규칙
      for (const sel of bareElementSelectors(readFileSync(file, "utf8"))) {
        offenders.push(`${path.relative(SRC_DIR, file)} — ${sel}`);
      }
    }
    expect(
      offenders,
      "라우트/컴포넌트 CSS 의 bare element 셀렉터는 앱 전체(Astryx 요소 포함)에 " +
        "샌다. 페이지 루트 클래스나 컴포넌트 클래스로 스코프하세요:\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("globals.css 의 a/button base reset 이 Astryx 요소를 제외한다", () => {
    const globals = files.find((f) => path.basename(f) === GLOBALS);
    expect(globals, "globals.css 를 찾지 못함").toBeDefined();
    const css = readFileSync(globals as string, "utf8");

    // bare `a {` / `button {` 이 있으면 Astryx 를 덮는다. `:not([class*="astryx-"])`
    // 로 제외했는지 확인 — 정확한 텍스트가 아니라 "bare 시작이 없다" 로 검사.
    const bare = bareElementSelectors(css).filter(
      (sel) => /\b(a|button|input|select|textarea)\b/.test(sel)
    );
    expect(
      bare,
      "globals.css 의 a/button/input 등 폼·링크 element 는 unlayered 라 Astryx " +
        "컴포넌트를 덮는다. `:not([class*=\"astryx-\"])` 로 제외하세요 (TASK-145):\n  " +
        bare.join("\n  ")
    ).toEqual([]);
  });
});
