// TASK-095: adminAllowListStore (Zustand 5.x).
//
// React frontend rewrite 시리즈 M4.5 Group A. Svelte `admin-store.ts` 의
// semantics 와 1:1 정합 — Build Server 의 GET /admin/admins 응답을 캐시
// + add/remove + contains(userId) 헬퍼.
//
// Svelte 의 writable + inner subscribe 패턴을 Zustand 의 create + selector
// 로 대체. store 단위 테스트 + React 컴포넌트 selector 구독 모두 가능.
//
// 비고: admin login 단계는 TASK-076 에서 사라졌다. userId 가 admin
// allow-list 에 속하면 Login 직후 admin 메뉴가 자동 노출되며, 별도
// adminId 가 없다. logout 시 userId null 이 되고 admin 메뉴도 자연스럽게
// 사라진다.

import { create } from "zustand";

import {
  addAdminToAllowList,
  listAdminAllowList,
  removeAdminFromAllowList,
  type AdminAllowListResponse
} from "@/lib/api";

type State = {
  admins: string[];
};

type Actions = {
  /** Fetches the allow-list from the Build Server using `callerId`'s
   * `X-Admin-Id` header. Throws if the caller is not in the allow-list
   * (server returns 403) or if the network call fails. Returns the
   * fetched list. */
  refresh: (callerId: string) => Promise<string[]>;
  /** Adds `newAdminId` via the Build Server and refreshes the cache. */
  add: (
    callerId: string,
    newAdminId: string
  ) => Promise<AdminAllowListResponse>;
  /** Removes `target` via the Build Server and refreshes the cache. */
  remove: (
    callerId: string,
    target: string
  ) => Promise<{ removed: string; admins: string[] }>;
  /** Resets the cached list (for tests / logout semantics). */
  reset: () => void;
};

const INITIAL_STATE: State = {
  admins: []
};

export const useAdminAllowListStore = create<State & Actions>((set) => ({
  ...INITIAL_STATE,
  refresh: async (callerId) => {
    const res = await listAdminAllowList(callerId);
    set({ admins: res.admins });
    return res.admins;
  },
  add: async (callerId, newAdminId) => {
    const res = await addAdminToAllowList(callerId, newAdminId);
    set({ admins: res.admins });
    return res;
  },
  remove: async (callerId, target) => {
    const res = await removeAdminFromAllowList(callerId, target);
    set({ admins: res.admins });
    return res;
  },
  reset: () => {
    set(INITIAL_STATE);
  }
}));
