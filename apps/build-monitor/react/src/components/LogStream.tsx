// TASK-091: LogStream (React).
//
// Svelte src/components/LogStream.svelte 와 1:1 정합. wrap 토글 +
// auto-scroll 토글 후속. 디자인 토큰 — --dib-code-bg / --dib-code-border /
// --dib-code-fg / --dib-code-muted / --dib-code-phase / --dib-code-inset-shadow.
//
// at 슬라이스 (`e.createdAt.slice(11, 19)`) 는 ISO 8601 의 HH:MM:SS
// 부분 — 운영자가 log stream 을 빠르게 스캔.

import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import type { BuildLogEntry } from "@/lib/api";

function LogEntrySpan({ entry }: { entry: BuildLogEntry }): ReactElement {
  const atStyle: CSSProperties = {
    color: "var(--dib-code-muted)",
    fontFamily: "var(--dib-font-mono)"
  };
  const phaseStyle: CSSProperties = {
    color: "var(--dib-code-phase)",
    fontWeight: "var(--dib-weight-semibold)",
    fontFamily: "var(--dib-font-mono)"
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
    gap: "var(--dib-space-md)"
  };

  const toolbarStyle: CSSProperties = {
    display: "flex",
    gap: "var(--dib-space-md)",
    color: "var(--dib-code-muted)",
    fontSize: "var(--dib-size-sm)",
    alignItems: "center",
    padding: "var(--dib-space-xs) var(--dib-space-md)",
    border: "1px solid var(--dib-color-border-subtle)",
    borderRadius: "var(--dib-radius-sm)",
    background: "var(--dib-color-bg-canvas)",
    width: "fit-content"
  };

  const preBaseStyle: CSSProperties = {
    background: "var(--dib-code-bg)",
    border: "1px solid var(--dib-color-border-subtle)",
    borderRadius: "var(--dib-radius-md)",
    padding: "var(--dib-space-lg)",
    fontFamily: "var(--dib-font-mono)",
    fontSize: "var(--dib-size-sm)",
    lineHeight: "var(--dib-line-relaxed)",
    color: "var(--dib-code-fg)",
    margin: 0,
    maxHeight: "480px",
    overflow: "auto",
    whiteSpace: "pre",
    boxShadow: "var(--dib-code-inset-shadow)"
  };

  const preWrapStyle: CSSProperties = {
    ...preBaseStyle,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  };

  return (
    <div data-testid="log-stream" style={wrapStyle}>
      <div style={toolbarStyle}>
        <label style={{ display: "flex", gap: "var(--dib-space-sm)" }}>
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
