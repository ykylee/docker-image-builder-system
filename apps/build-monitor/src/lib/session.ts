/**
 * Session store — build-monitor localStorage ↔ Svelte writable bridge.
 *
 * Background: Header.svelte 가 onMount + window 'storage' 이벤트로만
 * userId 를 다시 읽었기 때문에, 같은 SPA 라우트 트리에서 Login 이
 * localStorage 에 쓴 값을 Header 가 알지 못했다 (storage 이벤트는 다른
 * 탭에서만 fire). 결과적으로 로그인 직후에도 상단 네비게이션 바의
 * 계정/로그아웃이 즉시 노출되지 않았다.
 *
 * 이 store 는 writable<string | null> 을 노출하고, set 시 localStorage 도
 * 같이 쓴다. 다른 탭의 storage 이벤트는 여전히 read 경로에서 자동 반영
 * (storage 이벤트는 setItem 호출과 무관하게 다른 document 의 변경에만
 * fire 되므로, 같은 탭에서는 store.set 이 곧 single source of truth).
 *
 * TASK-076: admin 권한은 더 이상 별도 session 을 두지 않는다. admin
 * allow-list (`ADMIN_IDS` env) 에 userId 가 들어 있으면 Login 직후
 * admin 메뉴가 자동 노출되며, 별도 AdminLogin 단계나 admin logout 버튼은
 * 없다 — 일반 Logout 만 userId 를 clear 하면 admin 도 함께 사라진다.
 */
import { writable, type Readable } from "svelte/store";

export const USER_ID_KEY = "userId";

function readInitial(key: string): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem(key);
}

// SessionStore 는 Writable 과 모양이 비슷하지만, set 만 노출한다. update
// (현재 값 기반 함수형 갱신) 는 의도적으로 막아 두었다 — session 값은
// 항상 Login 의 submit 결과로만 바뀌어야 하고, 코드 어디서든
// `userIdStore.update(...)` 같은 호출로 변조될 여지를 주면 안 된다.
export interface SessionStore {
  subscribe: Readable<string | null>["subscribe"];
  set: (value: string | null) => void;
}

function createSessionStore(key: string): SessionStore {
  // subscribe 시점에 localStorage 를 다시 읽는다. module load time 의
  // readInitial 결과에 영구히 묶이지 않게 하기 위함 — 테스트는 module
  // import 전에 localStorage 를 설정하지만, production 에서도 첫 구독이
  // module load 보다 늦게 일어날 수 있어 동일 동작이 자연스럽다.
  const { subscribe, set } = writable<string | null>(null);

  // 다른 탭/창의 변경 반영. setItem 자체는 fire 하지 않으므로 같은 탭
  // 내부는 set() 경로로만 동기화.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key !== key) {
        return;
      }
      set(event.newValue);
    });
  }

  return {
    subscribe: (run, invalidate) => {
      // 첫 구독 시점의 localStorage 값으로 writable 을 한 번 동기화한
      // 뒤 구독을 시작한다. set 이 이미 호출된 후의 값은 그대로 보존.
      set(readInitial(key));
      return subscribe(run, invalidate);
    },
    set: (value: string | null) => {
      if (typeof localStorage !== "undefined") {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      }
      set(value);
    }
  };
}

export const userIdStore = createSessionStore(USER_ID_KEY);