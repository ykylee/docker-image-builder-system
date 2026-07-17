// TASK-091: LogStream (React).
//
// Svelte src/components/LogStream.svelte 와 1:1 정합. wrap 토글 +
// auto-scroll 토글 후속. 디자인 토큰 — --code-bg / --code-border /
// --code-fg / --code-muted / --code-phase / --code-inset-shadow.
//
// at 슬라이스 (`e.createdAt.slice(11, 19)`) 는 ISO 8601 의 HH:MM:SS
// 부분 — 운영자가 log stream 을 빠르게 스캔.

import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import type { BuildLogEntry } from "@/lib/api";

function LogEntrySpan({ entry }: { entry: BuildLogEntry }): ReactElement {
  const atStyle: CSSProperties = {
    color: "var(--code-muted)",
    fontFamily: "var(--font-mono)"
  };
  const phaseStyle: CSSProperties = {
    color: "var(--code-phase)",
    fontWeight: "var(--weight-semibold)",
    fontFamily: "var(--font-mono)"
  };
  return (
    <span data-testid="log-entry">
      <span style={atStyle}>{entry.createdAt.slice(11, 19)}</span>{" "}
      <span style={phaseStyle}>[{entry.phase}]</span>{" "}
      {entry.message}
      {"\n"}
    </span>
  );
}

export function LogStream({
  entries
}: {
  entries: BuildLogEntry[];
}): ReactElement {
  const [wrap, setWrap] = useState(false);

  const wrapStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-md)"
  };

  const toolbarStyle: CSSProperties = {
    display: "flex",
    gap: "var(--space-md)",
    color: "var(--code-muted)",
    fontSize: "var(--size-sm)",
    alignItems: "center",
    padding: "var(--space-xs) var(--space-md)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-bg-canvas)",
    width: "fit-content"
  };

  const preBaseStyle: CSSProperties = {
    background: "var(--code-bg)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-lg)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--size-sm)",
    lineHeight: "var(--line-relaxed)",
    color: "var(--code-fg)",
    margin: 0,
    maxHeight: "480px",
    overflow: "auto",
    whiteSpace: "pre",
    boxShadow: "var(--code-inset-shadow)"
  };

  const preWrapStyle: CSSProperties = {
    ...preBaseStyle,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  };

  return (
    <div data-testid="log-stream" style={wrapStyle}>
      <div style={toolbarStyle}>
        <label style={{ display: "flex", gap: "var(--space-sm)" }}>
          <input
            type="checkbox"
            data-testid="log-stream-wrap"
            checked={wrap}
            onChange={(e) => setWrap(e.target.checked)}
          />
          wrap
        </label>
      </div>
      <pre
        data-testid="log-stream-pre"
        style={wrap ? preWrapStyle : preBaseStyle}
      >
        {entries.map((entry, idx) => {
          const key = `${entry.id}-${entry.createdAt}-${idx}`;
          return <LogEntrySpan key={key} entry={entry} />;
        })}
      </pre>
    </div>
  );
}
