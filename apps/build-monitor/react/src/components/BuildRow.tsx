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
      "background-color var(--dib-motion-duration-fast) var(--dib-motion-easing-standard)"
  };
  const cellStyle: CSSProperties = {
    padding: "var(--dib-space-md) var(--dib-space-lg)",
    height: "48px",
    verticalAlign: "middle",
    borderBottom: "1px solid var(--dib-color-border-subtle)"
  };
  const idStyle: CSSProperties = {
    fontSize: "var(--dib-size-sm)",
    color: "var(--dib-color-accent-primary)",
    fontWeight: "var(--dib-weight-medium)",
    textDecoration: "none",
    fontFamily: "var(--dib-font-mono)"
  };
  const metaStyle: CSSProperties = {
    color: "var(--dib-color-text-secondary)",
    fontSize: "var(--dib-size-sm)",
    fontWeight: "var(--dib-weight-medium)",
    fontFamily: "var(--dib-font-mono)",
    // 길이가 긴 appName (e.g. feature/test-environment-deployment) 도
    // row 한 줄 유지 + ellipsis 로 시각 정리. hover/active 시
    // title attr 이 tooltip 으로 노출되어 운영자가 full name 확인.
    maxWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  };
  const timeStyle: CSSProperties = {
    color: "var(--dib-color-text-muted)",
    fontSize: "var(--dib-size-sm)",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums"
  };
  const ownerStyle: CSSProperties = {
    color: "var(--dib-color-text-primary)",
    fontSize: "var(--dib-size-sm)",
    fontWeight: "var(--dib-weight-semibold)",
    background: "var(--dib-color-bg-surface-elevated)",
    padding: "var(--dib-space-xs) var(--dib-space-md)",
    borderRadius: "var(--dib-radius-pill)",
    border: "1px solid var(--dib-color-border-strong)",
    width: "max-content",
    fontFamily: "var(--dib-font-mono)"
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