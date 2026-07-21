// TASK-136: themeStore (Zustand 5.x) — Astryx 도입 2단계.
//
// 왜 store 로 끌어올렸나: 테마 상태가 ThemeToggle 컴포넌트 안의 useState 에
// 갇혀 있었는데, Astryx `<Theme mode={...}>` 는 App 보다 **위**(main.tsx)에서
// mode 를 받아야 한다. 토글 버튼과 Theme 래퍼가 같은 상태를 봐야 하므로
// 공유 store 가 필요하다.
//
// DOM 반영(`data-theme` 속성 + `color-scheme`)도 여기로 함께 옮겼다. 이전에는
// ThemeToggle 이 렌더링과 DOM 부수효과를 같이 들고 있어서, 토글 버튼이 화면에
// 없는 페이지에서는 테마가 적용되지 않을 여지가 있었다.
//
// `data-theme` 은 우리 tokens.css 의 light cascade 를 구동하고, Astryx 는
// 별도로 `<Theme mode>` 를 받는다 — 이관이 끝날 때까지 두 체계가 같은 store 를
// 단일 출처로 공유한다.

import { create } from "zustand";

const STORAGE_KEY = "theme";

export type ThemeMode = "light" | "dark";

type State = {
  mode: ThemeMode;
};

type Actions = {
  /** 저장된 값 → 시스템 선호 순으로 초기 테마를 결정하고 DOM 에 반영한다. */
  init: () => void;
  /** 명시적으로 테마를 설정하고 DOM + localStorage 에 반영한다. */
  setMode: (mode: ThemeMode) => void;
  /** light ↔ dark 토글. */
  toggle: () => void;
};

/**
 * 저장값 → 시스템 선호 → dark 순으로 초기 테마를 정한다.
 *
 * 기본값이 dark 인 것은 의도된 제품 결정이다 (tokens.css 의 `:root` 가 다크).
 * TASK-132 의 P0 가 오래 잠복한 이유이기도 하므로, 검증할 때 **다크를 기본으로
 * 두고 본다**는 사실을 잊지 말 것.
 */
export function readInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  // jsdom 에는 matchMedia 가 없을 수 있어 방어.
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

/** `data-theme` 속성 + `color-scheme` 을 문서 루트에 반영한다. */
function applyToDocument(mode: ThemeMode): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (mode === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    // 다크는 tokens.css 의 `:root` 기본값이므로 속성을 **제거**한다.
    root.removeAttribute("data-theme");
  }
  // globals.css 가 `:root` / `:root[data-theme="light"]` 에 color-scheme 을
  // 명시 선언하지만, 인라인으로도 못박아 네이티브 폼 컨트롤·스크롤바가
  // 확실히 따라오게 한다.
  root.style.colorScheme = mode;
}

function persist(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Safari private mode 등에서 setItem 이 던질 수 있다. 테마는 저장에
    // 실패해도 이번 세션 동안은 정상 동작해야 하므로 삼킨다.
  }
}

export const useThemeStore = create<State & Actions>((set, get) => ({
  mode: "dark",

  init: () => {
    const mode = readInitialMode();
    applyToDocument(mode);
    set({ mode });
  },

  setMode: (mode) => {
    applyToDocument(mode);
    persist(mode);
    set({ mode });
  },

  toggle: () => {
    get().setMode(get().mode === "light" ? "dark" : "light");
  }
}));
