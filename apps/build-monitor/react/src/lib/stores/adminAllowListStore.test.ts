// TASK-095: adminAllowListStore unit tests.
//
// store 의 refresh / add / remove / reset 동작 검증. 5 case — 초기 상태 /
// refresh success / add / remove / reset.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/lib/api";
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

describe("useAdminAllowListStore", () => {
  it("starts in initial state", () => {
    const s = useAdminAllowListStore.getState();
    expect(s.admins).toEqual([]);
  });

  it("refresh populates admins on success", async () => {
    vi.mocked(api.listAdminAllowList).mockResolvedValue({
      admins: ["admin", "yky.lee"]
    });

    await useAdminAllowListStore.getState().refresh("admin");

    const s = useAdminAllowListStore.getState();
    expect(s.admins).toEqual(["admin", "yky.lee"]);
  });

  it("add updates admins with new id", async () => {
    vi.mocked(api.addAdminToAllowList).mockResolvedValue({
      admins: ["admin", "yky.lee", "newbie"]
    });

    await useAdminAllowListStore.getState().add("admin", "newbie");

    expect(useAdminAllowListStore.getState().admins).toContain("newbie");
  });

  it("remove updates admins without target id", async () => {
    useAdminAllowListStore.setState({ admins: ["admin", "yky.lee"] });
    vi.mocked(api.removeAdminFromAllowList).mockResolvedValue({
      removed: "yky.lee",
      admins: ["admin"]
    });

    await useAdminAllowListStore.getState().remove("admin", "yky.lee");

    const s = useAdminAllowListStore.getState();
    expect(s.admins).toEqual(["admin"]);
  });

  it("reset restores initial state", async () => {
    vi.mocked(api.listAdminAllowList).mockResolvedValue({
      admins: ["admin", "yky.lee"]
    });
    await useAdminAllowListStore.getState().refresh("admin");
    useAdminAllowListStore.getState().reset();

    expect(useAdminAllowListStore.getState().admins).toEqual([]);
  });
});
