import { describe, it, expect, beforeEach, vi } from "vitest";

// admin-guard.ts 가 admin-store 를 import 하므로 mock factory 가 hoist
// 되어야 한다. mock 의 inner store 는 closure 로 capture 한 뒤, 동시에
// mock 반환 객체에도 노출해서 helper 가 항상 inner store 까지 함께 set
// 하도록 한다 (TASK-077 mock 인프라 결함 봉인 패턴과 동일).
const { innerStore, listAdminAllowListMock } = vi.hoisted(() => {
  const { writable } = require("svelte/store") as typeof import("svelte/store");
  return {
    innerStore: writable<string[]>([]),
    listAdminAllowListMock: vi.fn()
  };
});

vi.mock("./admin-store.js", () => {
  const { get } = require("svelte/store") as typeof import("svelte/store");
  return {
    adminAllowListStore: {
      subscribe: innerStore.subscribe,
      snapshot: () => get(innerStore),
      contains: (id: string | null | undefined) => {
        if (!id) return false;
        return get(innerStore).includes(id);
      },
      refresh: async (callerId: string) => {
        const res = await listAdminAllowListMock(callerId);
        innerStore.set(res.admins);
        return res.admins;
      },
      add: async (callerId: string, newAdminId: string) => {
        const res = await listAdminAllowListMock(callerId, newAdminId);
        innerStore.set(res.admins);
        return res;
      },
      remove: async (callerId: string, target: string) => {
        const res = await listAdminAllowListMock(callerId, target);
        innerStore.set(res.admins);
        return res;
      }
    }
  };
});

import { ensureAdminAccess } from "./admin-guard.js";

beforeEach(() => {
  innerStore.set([]);
  listAdminAllowListMock.mockReset();
});

describe("ensureAdminAccess", () => {
  it("falsy callerId 면 즉시 NO_USER 로 거부 (refresh 시도 안 함)", async () => {
    const result = await ensureAdminAccess(null);
    expect(result).toEqual({ isAdmin: false, allowList: [], reason: "NO_USER" });
    expect(listAdminAllowListMock).not.toHaveBeenCalled();
  });

  it("callerId 가 빈 문자열이어도 NO_USER 로 거부", async () => {
    const result = await ensureAdminAccess("");
    expect(result.reason).toBe("NO_USER");
    expect(listAdminAllowListMock).not.toHaveBeenCalled();
  });

  it("캐시가 비어 있고 backend 가 admin 으로 인정 → isAdmin=true", async () => {
    listAdminAllowListMock.mockResolvedValueOnce({ admins: ["alice", "bob"] });
    const result = await ensureAdminAccess("alice");
    expect(result).toEqual({
      isAdmin: true,
      allowList: ["alice", "bob"],
      reason: "NOT_IN_ALLOW_LIST"
    });
    expect(listAdminAllowListMock).toHaveBeenCalledWith("alice");
  });

  it("캐시가 비어 있고 caller 가 allow-list 에 없으면 NOT_IN_ALLOW_LIST 로 거부", async () => {
    listAdminAllowListMock.mockResolvedValueOnce({ admins: ["admin", "yky.lee"] });
    const result = await ensureAdminAccess("alice");
    expect(result.isAdmin).toBe(false);
    expect(result.reason).toBe("NOT_IN_ALLOW_LIST");
    expect(result.allowList).toEqual(["admin", "yky.lee"]);
  });

  it("backend 가 403 으로 거절하면 reason=FORBIDDEN 으로 표면화", async () => {
    listAdminAllowListMock.mockRejectedValueOnce(
      new Error(`GET /admin/admins failed: 403 {"message":"Caller is not in the admin allow-list.","callerId":"alice"}`)
    );
    const result = await ensureAdminAccess("alice");
    expect(result.isAdmin).toBe(false);
    expect(result.reason).toBe("FORBIDDEN");
    // 캐시는 변경되지 않음 (refresh 가 실패했으므로).
    expect(result.allowList).toEqual([]);
  });

  it("backend 가 401 (헤더 누락) 로 거절해도 FORBIDDEN 으로 처리", async () => {
    listAdminAllowListMock.mockRejectedValueOnce(
      new Error("GET /admin/admins failed: 401")
    );
    const result = await ensureAdminAccess("");
    // falsy callerId 는 NO_USER 가 우선.
    expect(result.reason).toBe("NO_USER");
  });

  it("캐시가 이미 채워져 있으면 refresh 를 다시 호출하지 않음", async () => {
    innerStore.set(["admin", "yky.lee"]);
    const result = await ensureAdminAccess("admin");
    expect(result.isAdmin).toBe(true);
    expect(listAdminAllowListMock).not.toHaveBeenCalled();
    expect(result.allowList).toEqual(["admin", "yky.lee"]);
  });

  it("캐시가 채워져 있고 caller 가 admin 이 아니면 refresh 없이 즉시 NOT_IN_ALLOW_LIST", async () => {
    innerStore.set(["admin", "yky.lee"]);
    const result = await ensureAdminAccess("alice");
    expect(result.isAdmin).toBe(false);
    expect(result.reason).toBe("NOT_IN_ALLOW_LIST");
    expect(listAdminAllowListMock).not.toHaveBeenCalled();
  });

  it("backend 가 5xx (admin 가드 무관) 로 실패해도 캐시 변동 없이 isAdmin=false", async () => {
    listAdminAllowListMock.mockRejectedValueOnce(
      new Error("GET /admin/admins failed: 500 Internal Server Error")
    );
    const result = await ensureAdminAccess("alice");
    // 5xx 는 FORBIDDEN 으로 분류되지 않음 — callerId 의 admin 여부는
    // 미확정 상태로 NOT_IN_ALLOW_LIST fallback. 사용자가 새로고침하면
    // 다시 시도한다.
    expect(result.isAdmin).toBe(false);
    expect(result.reason).toBe("NOT_IN_ALLOW_LIST");
    expect(result.allowList).toEqual([]);
  });
});
