// TASK-095: ThemeToggle (React).
//
// Svelte src/components/ThemeToggle.svelte 와 1:1 정합. light/dark 토글
// + localStorage 영속화 + system preference fallback.
//
// a11y: aria-label "Toggle theme" + role="button" (button element).
//
// 디자인 토큰: --dib-color-text-secondary / --dib-color-bg-surface-elevated /
// --dib-color-text-primary / --dib-radius-pill / --dib-motion-duration-fast /
// --dib-motion-easing-standard. globals.css cascade 와 정합.

import { useEffect, useState, type ReactElement } from "react";

const STORAGE_KEY = "theme";

function readInitialTheme(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light") {
    return true;
  }
  if (stored === "dark") {
    return false;
  }
  // system preference fallback — prefers-color-scheme: light 일 때 light.
  // jsdom 에는 matchMedia 가 없어 try/catch 로 fallback.
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

function applyTheme(light: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  if (light) {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.colorScheme = "light";
    window.localStorage.setItem(STORAGE_KEY, "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "dark";
    window.localStorage.setItem(STORAGE_KEY, "dark");
  }
}

export function ThemeToggle(): ReactElement {
  // 첫 마운트 시점의 theme 결정은 useEffect 안에서 (DOM 접근 필요).
  // useState 의 initial value 는 SSR-safe 한 default (dark) 로 두고,
  // mount 후 readInitialTheme() 로 동기화. 단, 첫 paint 시점에는
  // light 가 결정될 가능성도 있어 SSR / hydration 시점 mismatch 가 발생할
  // 수 있다 — 본 React SPA 는 client-side only 라 hydration 단계 없으므로
  // 안전.
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const initial = readInitialTheme();
    setIsLight(initial);
    applyTheme(initial);
    // 첫 마운트 시 isLight 가 false 인 경우 setAttribute 가 호출되지
    // 않을 가능성 — 명시 보강.
    if (!initial) {
      document.documentElement.style.colorScheme = "dark";
    }
  }, []);

  function toggle(): void {
    const next = !isLight;
    setIsLight(next);
    applyTheme(next);
  }

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
