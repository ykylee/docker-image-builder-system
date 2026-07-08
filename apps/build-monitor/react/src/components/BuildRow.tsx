// TASK-090: BuildRow (React).
//
// Svelte src/components/BuildRow.svelte 와 1:1 정합. `<a use:link href=...>`
// 는 react-router-dom `<Link>` 로 치환. status 셀 + buildId (mono, 8글자
// prefix) + appName + updatedAt (relative time). requestedBy optional
// 시 owner 셀 노출 (BuildSummary 자체에는 없지만 AdminBuilds / AdminUsers
// caller 가 BuildSummary & { requestedBy } super-set 으로 전달 가능).

import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";

import type { BuildSummary } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function BuildRow({
  build
}: {
  build: BuildSummary & { requestedBy?: string };
}): ReactElement {
  const updated = relativeTime(build.updatedAt);

  const rowStyle: CSSProperties = {
    transition:
      "background-color var(--motion-duration-fast) var(--motion-easing-standard)"
  };
  const cellStyle: CSSProperties = {
    padding: "var(--space-md) var(--space-lg)",
    height: "48px",
    verticalAlign: "middle",
    borderBottom: "1px solid var(--color-border-subtle)"
  };
  const idStyle: CSSProperties = {
    fontSize: "var(--size-sm)",
    color: "var(--color-accent-primary)",
    fontWeight: "var(--weight-medium)",
    textDecoration: "none",
    fontFamily: "var(--font-mono)"
  };
  const metaStyle: CSSProperties = {
    color: "var(--color-text-secondary)",
    fontSize: "var(--size-sm)",
    fontWeight: "var(--weight-medium)",
    fontFamily: "var(--font-mono)"
  };
  const timeStyle: CSSProperties = {
    color: "var(--color-text-muted)",
    fontSize: "var(--size-sm)",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums"
  };
  const ownerStyle: CSSProperties = {
    color: "var(--color-text-primary)",
    fontSize: "var(--size-sm)",
    fontWeight: "var(--weight-semibold)",
    background: "var(--color-bg-surface-elevated)",
    padding: "var(--space-xs) var(--space-md)",
    borderRadius: "var(--radius-pill)",
    border: "1px solid var(--color-border-strong)",
    width: "max-content",
    fontFamily: "var(--font-mono)"
  };

  return (
    <tr data-testid="build-row" style={rowStyle}>
      <td style={cellStyle}>
        <StatusPill
          status={build.status}
          lifecycleStatus={build.lifecycleStatus}
        />
      </td>
      <td style={cellStyle}>
        <Link
          to={`/builds/${build.buildId}`}
          style={idStyle}
          className="mono"
        >
          {build.buildId.slice(0, 8)}
        </Link>
      </td>
      <td style={{ ...cellStyle, ...metaStyle }} title={build.appName}>
        {build.appName}
      </td>
      {build.requestedBy !== undefined && (
        <td style={{ ...cellStyle, ...ownerStyle }}>@{build.requestedBy}</td>
      )}
      <td style={{ ...cellStyle, ...timeStyle }} title={build.updatedAt}>
        {updated}
      </td>
    </tr>
  );
}