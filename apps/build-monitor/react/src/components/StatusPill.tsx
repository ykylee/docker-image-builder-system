// TASK-090: StatusPill (React).
//
// Svelte src/components/StatusPill.svelte 와 1:1 정합. canonical
// lifecycleStatus 가 emit 되면 그 값을 우선 표시, 없으면 legacy status.
// a11y: role="status" + aria-label="Status: <STATUS>".
//
// color 매핑도 Svelte colorFor switch 와 동일한 토큰 사용. CSS class
// 대신 inline CSS variable (`--pill-color`) 로 동일 톤.

import type { CSSProperties, ReactElement } from "react";

function colorFor(s: string): string {
  switch (s) {
    case "RECEIVED":
    case "QUEUED":
      return "var(--color-text-secondary)";
    case "PREPARING_SOURCE":
    case "BUILDING":
      return "var(--color-accent-warning)";
    case "BUILD_SUCCESS":
    case "TEST_SUCCESS":
    case "DEPLOY_SUCCESS":
    case "COMPLETED":
      return "var(--color-accent-success)";
    case "TESTING":
    case "DEPLOYING":
      return "var(--color-accent-info)";
    case "FAILED":
      return "var(--color-accent-danger)";
    case "CANCELLED":
      return "var(--color-text-secondary)";
    case "CLAIMED":
    case "TEST_READY":
      return "var(--color-accent-info)";
    case "PROVISIONING":
    case "PREVIEW_QUEUED":
    case "PREVIEW_READY":
      return "var(--color-accent-info)";
    case "EXPIRED":
      return "var(--color-text-secondary)";
    case "ACTIVE":
      return "var(--color-accent-success)";
    case "DISABLED":
      return "var(--color-accent-danger)";
    default:
      return "var(--color-text-secondary)";
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
    // React CSS variable binding — Svelte `style="--pill-color: {color}"`
    // 와 의미상 동일. Svelte scoped CSS 가 --pill-color 를 자동 인식하는
    // 반면 React 는 inline style 로 직접 주입.
    //
    // TASK-090 self-review 보강 — padding/font-size/background-alpha 키워�서
    // dark mode 가독성 ↑. 운영자가 build row 를 스캔할 때 StatusPill 의
    // 상태가 시각 anchor 역할. Svelte StatusPill.svelte 와 디자인 토큰은
    // 정합 유지 (padding 6px, size-sm) + background alpha 15% → 20% 로
    // pill 자체의 presence 강화.
    ["--pill-color" as string]: color,
    display: "inline-block",
    padding: "6px var(--space-lg)",
    borderRadius: "var(--radius-pill)",
    background: "color-mix(in srgb, var(--pill-color) 20%, transparent)",
    color: "var(--pill-color)",
    border: "1px solid color-mix(in srgb, var(--pill-color) 35%, transparent)",
    boxShadow:
      "0 0 10px color-mix(in srgb, var(--pill-color) 18%, transparent)",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--size-sm)",
    fontWeight: "var(--weight-semibold)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    lineHeight: "var(--line-tight)",
    whiteSpace: "nowrap"
  };

  return (
    <span role="status" aria-label={`Status: ${label}`} style={style}>
      {label}
    </span>
  );
}