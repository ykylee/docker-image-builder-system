// TASK-089: Login 페이지 React 마이그레이션 — userId session hook.
//
// Svelte src/lib/session.ts 의 `userIdStore` semantics 와 1:1 정합:
//   - localStorage key = "userId" (TASK-076 이후 동일, USER_ID_KEY export)
//   - set 시 localStorage 동기화 (null → removeItem, string → setItem)
//   - 다른 탭의 `storage` 이벤트로 cross-tab 동기화
//   - update 함수는 의도적으로 노출 안 함 — session 값은 Login submit
//     결과로만 바뀌어야 하고 임의 변조 경로를 막기 위함.
//
// React 19 + useSyncExternalStore 패턴. singleton listener set 으로
// store notify 를 구현해 React 외부의 localStorage 변경을 React 에게
// 알린다. Login 한 페이지에서만 사용하지만, 향후 Header.svelte → React
// Header 마이그레이션 시에도 동일 hook 재사용.
//
// SSR 안전 — `window` / `localStorage` 접근은 모두 typeof 가드.

import { useSyncExternalStore } from "react";

export const USER_ID_KEY = "userId";

const listeners = new Set<() => void>();

function notify(): void {
  // set iteration 는 insertion order. React 19 의 useSyncExternalStore
  // 가 listener 를 등록한 순서대로 호출되도록 보장.
  for (const listener of listeners) {
    listener();
  }
}

function readSnapshot(): string | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }
  return window.localStorage.getItem(USER_ID_KEY);
}

function subscribe(notifyListener: () => void): () => void {
  listeners.add(notifyListener);
  // 다른 탭 / window 의 localStorage 변경을 React 에게 알린다. 같은 탭
  // 의 setUserId() 는 직접 notify() 를 호출하므로 storage 이벤트가
  // fire 하지 않아도 React 가 re-render 된다.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === USER_ID_KEY || event.key === null) {
      notifyListener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notifyListener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Login submit 결과로만 호출되어야 하는 setter. 임의 컴포넌트가 직접
 * 호출하면 session invariant 가 깨지므로 주의 — Svelte session.ts 의
 * SessionStore.set 과 동일한 single-entry 의미.
 *
 * Cross-tab dispatch:
 *   다른 탭/창의 storage 변경은 브라우저가 자동으로 `storage` 이벤트를
 *   fire 한다. 그러나 동일 탭에서는 직접 dispatch 하지 않으면 우리
 *   subscribe 의 storage listener 가 fire 하지 않는다. Safari / older
 *   Firefox 등 일부 환경은 동일 탭 dispatchStorageEvent 도 무시하기
 *   때문에, 정합 보강을 위해 명시적으로 dispatch 한다. jsdom 과
 *   Chromium / Firefox 최신 버전에서는 동일 탭에서도 fire 된다.
 */
export function setUserId(value: string | null): void {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    if (value === null) {
      window.localStorage.removeItem(USER_ID_KEY);
    } else {
      window.localStorage.setItem(USER_ID_KEY, value);
    }
    // 동일 탭 storage listener 들에게 명시 알림 — 일부 환경 (Safari)
    // 은 동일 탭 dispatchStorageEvent 를 무시하므로 fire 되지 않을 수
    // 있으나, fire 되는 환경에서는 추가 안전망 역할. listener set 의
    // notify() 가 primary cross-listener 경로.
    window.dispatchEvent(new StorageEvent("storage", {
      key: USER_ID_KEY,
      newValue: value
    }));
  }
  notify();
}

/** Read-only snapshot — 라우터 가드나 비-React 코드에서 사용 가능. */
export function getUserId(): string | null {
  return readSnapshot();
}

/**
 * [userId, setUserId] 튜플. userId 가 바뀌면 React 가 자동으로
 * re-render 되고, 다른 탭의 변경도 storage 이벤트로 반영된다.
 */
export function useUserId(): readonly [string | null, (value: string | null) => void] {
  const userId = useSyncExternalStore(subscribe, readSnapshot, () => null);
  return [userId, setUserId] as const;
}