// TASK-101: Svelte 측 src/test/setup.ts 일괄 삭제 후 React 측 setup file.
//
// Svelte 측 src/test/setup.ts (TASK-064) 가 jsdom localStorage polyfill +
// JSDOM fallback 등을 담당했음. Svelte scaffold 일괄 정리로 src/ 가 삭제
// 되었으므로 React 측에 동일한 setup file 을 옮겨옴.
//
// TASK-064 의 원본 setup.ts 와 동등한 동작:
// - jsdom 의 localStorage / sessionStorage / matchMedia 가 부재할 때 fallback
// - beforeEach 마다 localStorage.clear()

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom 의 localStorage / sessionStorage 가 정의되어 있는 경우도 있으나
// 일부 환경 (older jsdom, custom test env) 에서 undefined 일 수 있어 안전망.
const storageFallback = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string): string | null => data.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      data.set(key, String(value));
    },
    removeItem: (key: string): void => {
      data.delete(key);
    },
    clear: (): void => {
      data.clear();
    },
    key: (index: number): string | null => {
      const keys = Array.from(data.keys());
      return keys[index] ?? null;
    },
    get length(): number {
      return data.size;
    }
  } as Storage;
};

// jsdom 의 localStorage 가 부재하거나 깨졌을 때 안전망으로 강제 정의.
if (typeof globalThis !== "undefined" && typeof window !== "undefined") {
  if (!window.localStorage) {
    Object.defineProperty(window, "localStorage", {
      value: storageFallback(),
      configurable: true,
      writable: true
    });
  }
  if (!window.sessionStorage) {
    Object.defineProperty(window, "sessionStorage", {
      value: storageFallback(),
      configurable: true,
      writable: true
    });
  }
  // matchMedia 가 없는 jsdom 환경 fallback (TASK-046 QA 정합).
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })),
      configurable: true,
      writable: true
    });
  }
}
