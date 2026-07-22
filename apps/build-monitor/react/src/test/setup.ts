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

// ── HTMLDialogElement 폴리필 (TASK-137, Astryx Dialog 이관) ──────────────
//
// jsdom 25 는 `<dialog>` 를 파싱은 하지만 `showModal()` / `show()` / `close()`
// 를 구현하지 않는다. Astryx `Dialog` 는 네이티브 `<dialog>` 를 쓰므로 폴리필
// 없이는 마운트 시점에 `dialog.showModal is not a function` 으로 죽는다.
//
// 실제 브라우저 동작을 완전히 재현하지는 않는다 — 특히 **포커스 트랩과
// backdrop 렌더링은 재현하지 않는다.** 그 둘은 jsdom 으로 검증할 수 없는
// 영역이므로, Dialog 의 접근성 동작은 B층 실브라우저 가드
// (scripts/check-theme-contrast.mjs) 와 수동 확인에 맡긴다. 여기서는
// "열림/닫힘 상태와 close 이벤트" 라는 테스트가 실제로 의존하는 부분만 채운다.
if (typeof window !== "undefined" && typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;

  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
      this.setAttribute("open", "");
    };
  }

  if (typeof proto.show !== "function") {
    proto.show = function show(this: HTMLDialogElement): void {
      this.open = true;
      this.setAttribute("open", "");
    };
  }

  if (typeof proto.close !== "function") {
    proto.close = function close(
      this: HTMLDialogElement,
      returnValue?: string
    ): void {
      this.open = false;
      this.removeAttribute("open");
      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }
      // 네이티브는 close 를 발화한다. Astryx 가 이걸 구독해 상태를 되돌린다.
      this.dispatchEvent(new Event("close"));
    };
  }
}

// ── ResizeObserver 폴리필 (TASK-144, Astryx AppShell 이관) ──────────────
//
// jsdom 은 ResizeObserver 를 구현하지 않는다. Astryx AppShell / TopNav 의
// responsive 처리(breakpoint 감지, 모바일 nav 전환)가 이를 쓰므로, 폴리필
// 없이는 마운트 시점에 `ResizeObserver is not defined` 로 죽는다.
//
// jsdom 에는 레이아웃 엔진이 없어 실제 크기 변화를 관측할 수 없다 — 이
// 폴리필은 인터페이스만 만족시키는 no-op 이다. **반응형 브레이크포인트
// 동작(모바일 nav 전환 등)은 jsdom 으로 검증 불가**하므로 실브라우저에
// 맡긴다. 여기서는 컴포넌트가 마운트 중 죽지 않게만 한다.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
