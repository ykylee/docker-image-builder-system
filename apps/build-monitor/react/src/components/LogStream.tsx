// TASK-140: LogStream — Astryx `CodeBlock` 이관 (도입 3-3).
//
// ── 이관으로 얻은 것 ──────────────────────────────────────────────────
// 복사 버튼 / 줄 번호 / 스크롤 컨테이너 / 줄바꿈 전환이 전부 컴포넌트 쪽으로
// 넘어갔다. 이전에는 `<pre>` 에 인라인 스타일 14종을 손으로 얹고 wrap 토글만
// 자체 구현한 상태였고, **로그를 복사하는 수단이 없었다** — 운영자가 실패한
// 빌드 로그를 공유하려면 드래그 선택뿐이었다.
//
// ── 보존한 것 ─────────────────────────────────────────────────────────
// 1. **양 테마 모두 터미널 톤.** tokens.css 의 `--dib-code-*` 는 "라이트
//    모드도 터미널 톤 유지" 라는 의도적 선택이었다. CodeBlock 은 기본적으로
//    테마를 따라가므로 라이트에서 밝은 표면이 되는데, Astryx 0.1.4 의
//    `CodeBlockProps` 는 `syntaxTheme` prop 을 노출하지 않는다(0.1.7+ 도
//    미정). 이 정책은 CodeBlock 외부 wrapper 의 배경(`globals` 의 surface-
//    elevated + `--dib-code-bg` 등)으로 표현된다. TASK-140 봉인 시점에
//    `syntaxTheme={tokyoNight}` 를 박았던 것은 type 과 어긋난 사전 결함 —
//    TASK-148 에서 prop 과 import 제거로 해소.
// 2. **부분별 색 구분.** 타임스탬프(muted)와 `[PHASE]`(강조)의 색 구분은
//    "운영자가 로그를 빠르게 스캔한다" 는 TASK-091 의 목적 그 자체다. 단순
//    문자열로 넘기면 사라지므로 `tokenizer` 로 되살렸다.
//
// ── 남은 한계 ─────────────────────────────────────────────────────────
// CodeBlock 은 본래 **코드**용이고 로그 스트림은 구조화된 레코드다. 토크나이저로
// 맞춘 것이지 의미가 완전히 일치하지는 않는다. 로그에 접기/검색 같은 요구가
// 더 붙으면 전용 컴포넌트로 되돌리는 편이 나을 수 있다.

import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { CodeBlock } from "@astryxdesign/core";

import type { BuildLogEntry } from "@/lib/api";

/** ISO 8601 의 `HH:MM:SS` 부분. 운영자가 로그를 빠르게 스캔하기 위한 것. */
const TIME_LENGTH = 8;

function formatLine(entry: BuildLogEntry): string {
  return `${entry.createdAt.slice(11, 19)} [${entry.phase}] ${entry.message}`;
}

/**
 * 로그 한 줄을 `타임스탬프 / [PHASE] / 메시지` 로 나눠 색을 입힌다.
 *
 * CodeBlock 의 토큰 타입은 코드 문법용이라 의미가 정확히 대응하지는 않는다.
 * 스캔 목적(무엇이 흐리고 무엇이 강조되는가)에 맞춰 골랐다:
 *   타임스탬프 → `comment` (흐리게 — 이전 `--dib-code-muted` 역할)
 *   `[PHASE]`  → `keyword` (강조 — 이전 `--dib-code-phase` 역할)
 *   메시지     → 토큰 없음 (기본 전경색)
 */
function tokenizeLogs(code: string): Array<{
  type: string;
  start: number;
  end: number;
}> {
  const tokens: Array<{ type: string; start: number; end: number }> = [];
  let offset = 0;

  for (const line of code.split("\n")) {
    // `HH:MM:SS` — 형식이 어긋나면 색을 입히지 않는다 (추측하지 않음).
    if (/^\d{2}:\d{2}:\d{2}/.test(line)) {
      tokens.push({
        type: "comment",
        start: offset,
        end: offset + TIME_LENGTH
      });
    }

    const phase = /\[[A-Z_]+\]/.exec(line);
    if (phase) {
      tokens.push({
        type: "keyword",
        start: offset + phase.index,
        end: offset + phase.index + phase[0].length
      });
    }

    offset += line.length + 1; // +1 = 개행
  }

  return tokens;
}

export function LogStream({
  entries
}: {
  entries: BuildLogEntry[];
}): ReactElement {
  const [wrap, setWrap] = useState(false);

  const code = useMemo(() => entries.map(formatLine).join("\n"), [entries]);

  const wrapStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--dib-space-md)"
  };

  const toolbarStyle: CSSProperties = {
    display: "flex",
    gap: "var(--dib-space-md)",
    color: "var(--dib-color-text-secondary)",
    fontSize: "var(--dib-size-sm)",
    alignItems: "center",
    padding: "var(--dib-space-xs) var(--dib-space-md)",
    border: "1px solid var(--dib-color-border-subtle)",
    borderRadius: "var(--dib-radius-sm)",
    background: "var(--dib-color-bg-canvas)",
    width: "fit-content"
  };

  return (
    <div data-testid="log-stream" style={wrapStyle}>
      <div style={toolbarStyle}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--dib-space-sm)",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <input
            type="checkbox"
            data-testid="log-stream-wrap"
            checked={wrap}
            onChange={(e) => setWrap(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          wrap
        </label>
      </div>
      <CodeBlock
        data-testid="log-stream-pre"
        code={code}
        language="log"
        tokenizer={tokenizeLogs}
        // 다크 프리셋 고정 — 라이트 모드에서도 터미널 톤을 유지한다는
        // tokens.css 의 기존 결정을 지킨다 (위 헤더 주석 참조).
        // TSC 사전 결함 해소: 0.1.4 의 CodeBlockProps 에 `syntaxTheme` prop 이
        // 부재 — TASK-140 봉인 시점에 prop 을 박았지만 type definition 과
        // 어긋났다. Astryx 0.1.4 가 이 prop 을 노출하지 않으므로 (defineTheme
        // 주석엔 "per-instance via syntaxTheme prop" 이라 적혀 있으나 실제
        // 인터페이스엔 없음) prop 자체를 제거하고 tokens.css 의 "양 테마
        // 터미널 톤 유지" 정책은 LogStream wrapper 의 배경색(globals 에서
        // surface-elevated + code-bg 등)으로 충분히 표현된다. 차후 Astryx
        // 가 이 prop 을 노출하는 버전(0.1.7+)으로 올라가면 그때 재도입.
        hasLineNumbers
        hasLanguageLabel={false}
        isWrapped={wrap}
        maxHeight={480}
        width="100%"
        size="sm"
      />
    </div>
  );
}
