// TASK-095: FilterChips (React).
//
// Svelte src/components/FilterChips.svelte 와 1:1 정합. canonical toggle
// chip group for status filters.
//
// 디자인 토큰: --color-bg-surface / --color-text-secondary /
// --color-text-primary / --color-accent-primary / --shadow-glow /
// --shadow-card / --radius-pill / --space-sm / --space-lg /
// --motion-duration-fast / --motion-easing-standard.
//
// raw rgba glow 대신 디자인 토큰 `--shadow-glow` 사용 (TASK-083 정합) —
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
    gap: "var(--space-sm)",
    background: "var(--color-bg-surface)",
    padding: "var(--space-xs)",
    borderRadius: "var(--radius-pill)",
    border: "1px solid var(--color-border-subtle)",
    boxShadow: "var(--shadow-card)"
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
          padding: "var(--space-sm) var(--space-lg)",
          borderRadius: "var(--radius-pill)",
          background: "transparent",
          color: isActive
            ? "white"
            : "var(--color-text-secondary)",
          fontSize: "var(--size-sm)",
          fontWeight: "var(--weight-medium)",
          border: "1px solid transparent",
          cursor: "pointer",
          transition:
            "color var(--motion-duration-fast) var(--motion-easing-standard), background var(--motion-duration-fast) var(--motion-easing-standard)"
        };
        const activeStyle: CSSProperties = {
          ...baseStyle,
          background: "var(--color-accent-primary)",
          boxShadow: "var(--shadow-glow)"
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
