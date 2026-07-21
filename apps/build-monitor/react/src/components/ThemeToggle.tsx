// TASK-095: ThemeToggle (React).
//
// Svelte src/components/ThemeToggle.svelte 와 1:1 정합. light/dark 토글.
//
// TASK-136: 테마 상태 / localStorage 영속화 / system preference fallback /
// DOM 반영은 전부 `lib/stores/themeStore.ts` 로 이관됐다. 본 컴포넌트는
// 이제 표시와 클릭만 담당한다 — Astryx `<Theme mode>` 가 App 보다 위에서
// 같은 상태를 봐야 하기 때문 (main.tsx 의 ThemedApp).
//
// a11y: aria-label "Toggle theme" + role="button" (button element).
//
// 디자인 토큰: --dib-color-text-secondary / --dib-color-bg-surface-elevated /
// --dib-color-text-primary / --dib-radius-pill / --dib-motion-duration-fast /
// --dib-motion-easing-standard. globals.css cascade 와 정합.

import { type ReactElement } from "react";

import { useThemeStore } from "@/lib/stores/themeStore";

export function ThemeToggle(): ReactElement {
  // TASK-136: 테마 상태와 DOM 반영은 themeStore 로 이관됐다. Astryx
  // `<Theme mode>` 가 App 보다 위(main.tsx)에서 같은 값을 봐야 하므로
  // 컴포넌트 지역 상태로는 둘 수 없다. 초기화(init)도 store 를 쓰는
  // main.tsx 의 ThemedApp 이 담당한다 — 토글 버튼이 없는 페이지에서도
  // 테마가 적용되어야 하기 때문.
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const isLight = mode === "light";

  const buttonStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: "var(--dib-radius-pill)",
    color: "var(--dib-color-text-secondary)",
    background: "transparent",
    border: "1px solid transparent",
    cursor: "pointer",
    transition:
      "all var(--dib-motion-duration-fast) var(--dib-motion-easing-standard)"
  };

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label="Toggle theme"
      style={buttonStyle}
      onClick={toggle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--dib-color-bg-surface-elevated)";
        e.currentTarget.style.color = "var(--dib-color-text-primary)";
        e.currentTarget.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--dib-color-text-secondary)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {isLight ? (
        // Moon icon — switching to dark
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sun icon — switching to light
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}
