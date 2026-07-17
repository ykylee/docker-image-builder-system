// TASK-097: admin-guard (React) 단위 테스트.
//
// Svelte admin-guard.ts 의 동작을 React + Zustand useAdminAllowListStore 와
// 동등 검증. 4 case — NO_USER / 캐시 hit / refresh success NOT_IN_ALLOW_LIST /
// refresh 403 FORBIDDEN.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
import { ensureAdminAccess } from "@/lib/admin-guard";
import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";

vi.mock("@/lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    listAdminAllowList: vi.fn(),
    addAdminToAllowList: vi.fn(),
    removeAdminFromAllowList: vi.fn()
  };
});

beforeEach(() => {
  useAdminAllowListStore.getState().reset();
});

afterEach(() => {
  useAdminAllowListStore.getState().reset();
});

describe("ensureAdminAccess (TASK-097)", () => {
  it("returns NO_USER for falsy callerId", async () => {
    const r1 = await ensureAdminAccess(null);
    expect(r1.isAdmin).toBe(false);
    expect(r1.reason).toBe("NO_USER");
    const r2 = await ensureAdminAccess(undefined);
    expect(r2.reason).toBe("NO_USER");
    const r3 = await ensureAdminAccess("");
    expect(r3.reason).toBe("NO_USER");
  });

  it("returns isAdmin=true when callerId is in cached allow-list", async () => {
    useAdminAllowListStore.setState({ admins: ["admin", "yklee"] });
    const r = await ensureAdminAccess("yklee");
    expect(r.isAdmin).toBe(true);
    expect(r.allowList).toEqual(["admin", "yklee"]);
  });

  it("returns NOT_IN_ALLOW_LIST when refresh succeeds but callerId is not listed", async () => {
    vi.mocked(api.listAdminAllowList).mockResolvedValue({
      admins: ["admin"]
    });
    const r = await ensureAdminAccess("yklee");
    expect(r.isAdmin).toBe(false);
    expect(r.reason).toBe("NOT_IN_ALLOW_LIST");
    expect(r.allowList).toEqual(["admin"]);
  });

  it("returns FORBIDDEN when refresh fails with 401/403", async () => {
    vi.mocked(api.listAdminAllowList).mockRejectedValue(
      new Error("GET /admin/admins failed: 403 Forbidden")
    );
    const r = await ensureAdminAccess("yklee");
    expect(r.isAdmin).toBe(false);
    expect(r.reason).toBe("FORBIDDEN");
  });
});
