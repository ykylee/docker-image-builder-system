// TASK-090: StatusPill (React).
//
// Svelte src/components/StatusPill.svelte 와 1:1 정합. canonical
// lifecycleStatus 가 emit 되면 그 값을 우선 표시, 없으면 legacy status.
// a11y: role="status" + aria-label="Status: <STATUS>".
//
// color 매핑도 Svelte colorFor switch 와 동일한 토큰 사용. CSS class
// 대신 inline CSS variable (`--dib-pill-color`) 로 동일 톤.

import type { CSSProperties, ReactElement } from "react";

function colorFor(s: string): string {
  switch (s) {
    case "RECEIVED":
    case "QUEUED":
      return "var(--dib-color-text-secondary)";
    case "PREPARING_SOURCE":
    case "BUILDING":
      return "var(--dib-color-accent-warning)";
    case "BUILD_SUCCESS":
    case "TEST_SUCCESS":
    case "DEPLOY_SUCCESS":
    case "COMPLETED":
      return "var(--dib-color-accent-success)";
    case "TESTING":
    case "DEPLOYING":
      return "var(--dib-color-accent-info)";
    case "FAILED":
      return "var(--dib-color-accent-danger)";
    case "CANCELLED":
      return "var(--dib-color-text-secondary)";
    case "CLAIMED":
    case "TEST_READY":
      return "var(--dib-color-accent-info)";
    case "PROVISIONING":
    case "PREVIEW_QUEUED":
    case "PREVIEW_READY":
      return "var(--dib-color-accent-info)";
    case "EXPIRED":
      return "var(--dib-color-text-secondary)";
    case "ACTIVE":
      return "var(--dib-color-accent-success)";
    case "DISABLED":
      return "var(--dib-color-accent-danger)";
    default:
      return "var(--dib-color-text-secondary)";
  }
}

export function StatusPill({
  status,
  lifecycleStatus
}: {
  status: string;
  lifecycleStatus?: string;
}): ReactElement {
  const effective = lifecycleStatus ?? status;
  const color = colorFor(effective);
  const label = effective || "UNKNOWN";

  const style: CSSProperties = {
    // React CSS variable binding — Svelte `style="--dib-pill-color: {color}"`
    // 와 의미상 동일. Svelte scoped CSS 가 --dib-pill-color 를 자동 인식하는
    // 반면 React 는 inline style 로 직접 주입.
    //
    // TASK-096: 디자인 토큰 baseline 정합. TASK-090 의 self-review 에서
    // padding/font-size/background-alpha 키워서 dark mode 가독성 ↑ 보강이
    // 있었으나, Svelte StatusPill.svelte 와 의미상 1:1 정합이라는
    // TASK-090 PR description 과 정합하지 않음. 본 TASK 에서 Svelte
    // baseline 으로 통일 — 양쪽 모두 padding 4px / size-xs / background
    // alpha 15% / border alpha 30% / box-shadow 8px.
    ["--dib-pill-color" as string]: color,
    display: "inline-block",
    padding: "4px var(--dib-space-md)",
    borderRadius: "var(--dib-radius-pill)",
    background: "color-mix(in srgb, var(--dib-pill-color) 15%, transparent)",
    color: "var(--dib-pill-color)",
    border: "1px solid color-mix(in srgb, var(--dib-pill-color) 30%, transparent)",
    boxShadow:
      "0 0 8px color-mix(in srgb, var(--dib-pill-color) 15%, transparent)",
    fontFamily: "var(--dib-font-mono)",
    fontSize: "var(--dib-size-xs)",
    fontWeight: "var(--dib-weight-semibold)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    lineHeight: "var(--dib-line-tight)",
    whiteSpace: "nowrap"
  };

  return (
    <span role="status" aria-label={`Status: ${label}`} style={style}>
      {label}
    </span>
  );
}