// TASK-133 — 미정의 디자인 토큰 lint (A층).
//
// 배경: TASK-132 의 P3 는 `var(--font-family-sans)` / `var(--color-bg-elevated)`
// / `var(--color-bg-input)` 세 토큰이 **어디에도 정의되지 않은 채** 쓰이고
// 있던 결함이었다. CSS 의 var() 는 미정의여도 오류를 내지 않고 조용히
// 폴백(또는 상속값)으로 넘어가기 때문에 화면이 깨질 때까지 드러나지 않는다.
// 실제로 RegisterRunnerModal 은 하드코딩 폴백 때문에 **라이트 모드에서 모달만
// 검정색**이었고, BuildDetail 은 그 페이지만 서체가 달랐다.
//
// 그 3종은 TASK-132 에서 수동 grep 으로 찾아 해소했다. 본 lint 는 같은 결함이
// 다시 들어오는 것을 막는다 — 수동 grep 은 반복되지 않으므로.
//
// 폴백이 있어도 실패로 본다: `var(--없는토큰, #5b8def)` 는 테마가 바뀌어도
// 색이 고정되므로 정확히 TASK-132 가 겪은 증상을 만든다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readThemes, SRC_DIR } from "./test/contrast";

const SCAN_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);

/** `var(--name` 에서 name 을 뽑는다 (폴백 유무 무관). */
const VAR_USAGE = /var\(\s*(--[a-zA-Z0-9-]+)/g;
/** `--name:` 선언 — CSS 규칙과 TSX inline style 양쪽. */
const VAR_DECLARATION = /(--[a-zA-Z0-9-]+)\s*"?\s*(?:as string\])?\s*:/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 선언된 커스텀 프로퍼티 전체.
 *
 * tokens.css 의 전역 토큰뿐 아니라, 컴포넌트가 지역적으로 선언해서 쓰는
 * 프로퍼티(예: StatusPill 의 `--dib-pill-color`)도 정당한 정의다. 후자를 빼면
 * 오탐이 난다.
 */
function collectDeclared(files: readonly string[]): Set<string> {
  const declared = new Set<string>();
  const { dark, light } = readThemes();
  for (const token of [...Object.keys(dark), ...Object.keys(light)]) {
    declared.add(token);
  }
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(VAR_DECLARATION)) {
      declared.add(match[1]);
    }
  }
  return declared;
}

describe("디자인 토큰 정의 검사", () => {
  const files = walk(SRC_DIR);
  const declared = collectDeclared(files);

  it("var() 로 참조되는 모든 토큰이 정의되어 있다", () => {
    const undefinedUsages: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");

      lines.forEach((line, index) => {
        // tokens.css 는 주석에서 토큰 이름을 예시로 든다 (`var(--color-*)` 등).
        // 주석 줄은 검사 대상이 아니다.
        const trimmed = line.trim();
        if (
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("//")
        ) {
          return;
        }

        for (const match of line.matchAll(VAR_USAGE)) {
          const token = match[1];
          // `var(--color-*)` 처럼 와일드카드를 쓴 서술은 토큰이 아니다.
          if (token.endsWith("-")) continue;
          if (!declared.has(token)) {
            undefinedUsages.push(
              `${path.relative(SRC_DIR, file)}:${index + 1} — ${token}`
            );
          }
        }
      });
    }

    expect(
      undefinedUsages,
      `정의되지 않은 토큰을 var() 로 참조하고 있습니다. CSS 는 이 경우 오류 ` +
        `없이 폴백/상속값으로 넘어가므로 테마 전환 시에만 증상이 드러납니다 ` +
        `(TASK-132 P3 와 동일 결함):\n  ${undefinedUsages.join("\n  ")}`
    ).toEqual([]);
  });

  it("tokens.css 가 두 테마 블록을 모두 노출한다", () => {
    // 파싱이 조용히 빈 맵을 반환하면 위 검사가 무력화되므로, 파서가 실제로
    // 토큰을 읽었는지 자체 확인한다 (가드의 가드).
    const { dark, light } = readThemes();
    expect(Object.keys(dark).length).toBeGreaterThan(50);
    expect(Object.keys(light).length).toBeGreaterThan(50);
  });
});
