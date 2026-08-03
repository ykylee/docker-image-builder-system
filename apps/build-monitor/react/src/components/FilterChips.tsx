// TASK-095: FilterChips (React).
//
// Svelte src/components/FilterChips.svelte 와 1:1 정합. canonical toggle
// chip group for status filters.
//
// 디자인 토큰: --dib-color-bg-surface / --dib-color-text-secondary /
// --dib-color-text-primary / --dib-color-accent-primary / --dib-shadow-glow /
// --dib-shadow-card / --dib-radius-pill / --dib-space-sm / --dib-space-lg /
// --dib-motion-duration-fast / --dib-motion-easing-standard.
//
// raw rgba glow 대신 디자인 토큰 `--dib-shadow-glow` 사용 (TASK-083 정합) —
// dark / light 모드 자동 follow.

import type { CSSProperties, ReactElement } from "react";

export function FilterChips<T extends string>({
  options,
  selected,
  onSelect,
  ariaLabel = "Filter options"
}: {
  options: ReadonlyArray<T>;
  selected: T;
  onSelect: (value: T) => void;
  ariaLabel?: string;
}): ReactElement {
  const groupStyle: CSSProperties = {
    display: "inline-flex",
    gap: "var(--dib-space-sm)",
    background: "var(--dib-color-bg-surface)",
    padding: "var(--dib-space-xs)",
    borderRadius: "var(--dib-radius-pill)",
    border: "1px solid var(--dib-color-border-subtle)",
    boxShadow: "var(--dib-shadow-card)"
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid="filter-chips"
      style={groupStyle}
    >
      {options.map((option) => {
        const isActive = selected === option;
        const baseStyle: CSSProperties = {
          padding: "var(--dib-space-sm) var(--dib-space-lg)",
          borderRadius: "var(--dib-radius-pill)",
          background: "transparent",
          color: isActive
            ? "var(--dib-color-on-accent)"
            : "var(--dib-color-text-secondary)",
          fontSize: "var(--dib-size-sm)",
          fontWeight: "var(--dib-weight-medium)",
          border: "1px solid transparent",
          cursor: "pointer",
          transition:
            "color var(--dib-motion-duration-fast) var(--dib-motion-easing-standard), background var(--dib-motion-duration-fast) var(--dib-motion-easing-standard)"
        };
        const activeStyle: CSSProperties = {
          ...baseStyle,
          background: "var(--dib-color-accent-primary)",
          boxShadow: "var(--dib-shadow-glow)"
        };
        return (
          <button
            key={option}
            type="button"
            data-testid={`filter-chip-${option}`}
            aria-pressed={isActive}
            onClick={() => {
              onSelect(option);
            }}
            style={isActive ? activeStyle : baseStyle}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
