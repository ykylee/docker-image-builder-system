// TASK-097: Admin guard helper (React).
//
// Svelte src/lib/admin-guard.ts 와 1:1 정합. TASK-084 의 deep link UX —
// 비-admin user 가 /admin/* deep link 진입 시 backend 401/403 envelope
// 대신 친절한 권한 없음 패널 노출.
//
// React 측에서는 Svelte 의 admin-store.js 대신 Zustand
// useAdminAllowListStore (TASK-095) 사용.

import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";

export interface AdminAccessResult {
  /**
   * true if `callerId` is in the admin allow-list. false otherwise.
   */
  isAdmin: boolean;
  /** The allow-list as observed at the time of the call (possibly empty). */
  allowList: string[];
  /**
   * The reason a caller was denied. Useful for surfacing a more accurate
   * message in the page's error panel.
   */
  reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST";
}

export async function ensureAdminAccess(
  callerId: string | null | undefined
): Promise<AdminAccessResult> {
  if (!callerId) {
    return { isAdmin: false, allowList: [], reason: "NO_USER" };
  }
  const store = useAdminAllowListStore.getState();
  let refreshFailedForbidden = false;
  if (store.admins.length === 0) {
    try {
      await store.refresh(callerId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/failed: 401|failed: 403/.test(message)) {
        refreshFailedForbidden = true;
      }
    }
  }
  const allowList = useAdminAllowListStore.getState().admins;
  if (allowList.includes(callerId)) {
    return { isAdmin: true, allowList, reason: "NOT_IN_ALLOW_LIST" };
  }
  return {
    isAdmin: false,
    allowList,
    reason: refreshFailedForbidden ? "FORBIDDEN" : "NOT_IN_ALLOW_LIST"
  };
}
