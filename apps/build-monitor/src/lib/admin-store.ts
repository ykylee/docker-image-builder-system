/**
 * admin store — build-monitor admin allow-list cache.
 *
 * The build-monitor does not have its own admin allow-list. The canonical
 * list lives on the Build Server (`runtime.adminIds` seeded from
 * `ADMIN_IDS` env, mutated via `/admin/admins` endpoints). The build-
 * monitor fetches the list on demand so that:
 *  - The "Admin" link is auto-shown for callers whose userId is in the
 *    allow-list, even before they visit `/admin/login` (TASK-048).
 *  - The "Admin · Admins" page can list / add / remove admins through
 *    the same store (TASK-049).
 *
 * The store is intentionally non-reactive w.r.t. Svelte 5 runes; the
 * components that need it use `$state` in the consumer. We expose a
 * minimal Svelte store so non-rune code (e.g. Header) can `subscribe`.
 *
 * Source of truth: the Build Server's `GET /admin/admins` response. The
 * client never edits the list locally; mutations go through
 * `addAdminToAllowList` / `removeAdminFromAllowList` in api.ts and the
 * store refreshes after a successful mutation.
 */
import { writable, type Readable, get } from "svelte/store";

import {
  listAdminAllowList,
  addAdminToAllowList,
  removeAdminFromAllowList,
  type AdminAllowListResponse
} from "./api.js";

export interface AdminAllowListStore {
  subscribe: Readable<string[]>["subscribe"];
  /** Returns the latest cached allow-list (empty if not yet loaded). */
  snapshot(): string[];
  /** Returns true if `userId` is in the cached allow-list. */
  contains(userId: string | null | undefined): boolean;
  /**
   * Fetches the allow-list from the Build Server using `callerId`'s
   * `X-Admin-Id` header. Throws if the caller is not in the allow-list
   * (server returns 403) or if the network call fails. Returns the
   * fetched list.
   */
  refresh(callerId: string): Promise<string[]>;
  /** Adds `newAdminId` via the Build Server and refreshes the cache. */
  add(callerId: string, newAdminId: string): Promise<AdminAllowListResponse>;
  /** Removes `target` via the Build Server and refreshes the cache. */
  remove(callerId: string, target: string): Promise<{ removed: string; admins: string[] }>;
}

function createAdminAllowListStore(): AdminAllowListStore {
  const inner = writable<string[]>([]);

  return {
    subscribe: inner.subscribe,
    snapshot(): string[] {
      return get(inner);
    },
    contains(userId) {
      if (!userId) return false;
      return get(inner).includes(userId);
    },
    async refresh(callerId) {
      const res = await listAdminAllowList(callerId);
      inner.set(res.admins);
      return res.admins;
    },
    async add(callerId, newAdminId) {
      const res = await addAdminToAllowList(callerId, newAdminId);
      inner.set(res.admins);
      return res;
    },
    async remove(callerId, target) {
      const res = await removeAdminFromAllowList(callerId, target);
      inner.set(res.admins);
      return res;
    }
  };
}

export const adminAllowListStore = createAdminAllowListStore();
