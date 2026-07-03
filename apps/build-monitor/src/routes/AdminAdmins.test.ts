import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import AdminAdmins from "./AdminAdmins.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

// admin-store 모킹. 실제 fetch 가 아닌 in-memory store 로 list/add/remove
// 검증. 테스트 케이스에서 setAdminAllowList 로 미리 채워서 mount 한다.
const adminAllowListRef: { value: string[] } = { value: [] };
const setAdminAllowList = (v: string[]) => {
  adminAllowListRef.value = v;
};
vi.mock("../lib/admin-store.js", () => {
  // vi.mock factory 안에서는 ESM import 를 못 쓰므로 require 로 가져온다.
  const inner = (require("svelte/store") as typeof import("svelte/store")).writable<string[]>([]);
  return {
    adminAllowListStore: {
      subscribe: inner.subscribe,
      snapshot: () => adminAllowListRef.value,
      contains: (id: string | null | undefined) => !!id && adminAllowListRef.value.includes(id),
      refresh: async (caller: string) => {
        // caller 가 seed list 에 있어야 refresh 가 성공한다고 가정.
        if (!adminAllowListRef.value.includes(caller)) {
          throw new Error("forbidden");
        }
        inner.set(adminAllowListRef.value);
        return adminAllowListRef.value;
      },
      add: async (caller: string, newId: string) => {
        if (!adminAllowListRef.value.includes(caller)) {
          throw new Error("forbidden");
        }
        const next = adminAllowListRef.value.includes(newId)
          ? adminAllowListRef.value
          : [...adminAllowListRef.value, newId];
        adminAllowListRef.value = next;
        inner.set(next);
        return { admins: next };
      },
      remove: async (caller: string, target: string) => {
        if (!adminAllowListRef.value.includes(caller)) {
          throw new Error("forbidden");
        }
        // seed (first element) 은 보호.
        if (target === adminAllowListRef.value[0]) {
          throw new Error("seed id not removable");
        }
        const next = adminAllowListRef.value.filter((a) => a !== target);
        adminAllowListRef.value = next;
        inner.set(next);
        return { removed: target, admins: next };
      }
    }
  };
});

beforeEach(() => {
  pushMock.mockReset();
  localStorage.clear();
  setAdminAllowList([]);
});

afterEach(() => {
  cleanup();
  setAdminAllowList([]);
});

describe("AdminAdmins (TASK-049)", () => {
  it("redirects to /admin/login when no admin session and no userId", async () => {
    render(AdminAdmins);
    // onMount 마이크로태스크 끝난 뒤
    await Promise.resolve();
    expect(pushMock).toHaveBeenCalledWith("/admin/login");
  });

  it("renders the allow-list with seed protected", async () => {
    localStorage.setItem("adminId", "admin");
    setAdminAllowList(["admin", "yky.lee"]);
    render(AdminAdmins);
    await Promise.resolve();
    await Promise.resolve();
    // 두 row 가 보여야 함.
    expect(screen.getByText("@admin")).toBeInTheDocument();
    expect(screen.getByText("@yky.lee")).toBeInTheDocument();
    // seed badge.
    expect(screen.getByText(/seed \(protected\)/)).toBeInTheDocument();
  });

  it("disables the Remove button for the seed row", async () => {
    localStorage.setItem("adminId", "admin");
    setAdminAllowList(["admin", "yky.lee"]);
    render(AdminAdmins);
    await Promise.resolve();
    await Promise.resolve();
    const seedRow = screen.getByText("@admin").closest("tr");
    expect(seedRow).not.toBeNull();
    const removeBtn = seedRow?.querySelector("button.btn-danger") as HTMLButtonElement | null;
    expect(removeBtn).not.toBeNull();
    expect(removeBtn?.disabled).toBe(true);
  });

  it("adds a new admin via the form", async () => {
    localStorage.setItem("adminId", "admin");
    setAdminAllowList(["admin"]);
    render(AdminAdmins);
    await Promise.resolve();
    await Promise.resolve();
    const input = screen.getByPlaceholderText("userId") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "alice" } });
    const submit = screen.getByRole("button", { name: /add admin/i });
    await fireEvent.click(submit);
    // store 가 갱신되고 DOM 에 반영.
    expect(adminAllowListRef.value).toContain("alice");
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("refuses to remove a non-existing admin via the store", async () => {
    localStorage.setItem("adminId", "admin");
    setAdminAllowList(["admin", "yky.lee"]);
    render(AdminAdmins);
    await Promise.resolve();
    await Promise.resolve();
    const row = screen.getByText("@yky.lee").closest("tr");
    const removeBtn = row?.querySelector("button.btn-danger") as HTMLButtonElement | null;
    expect(removeBtn).not.toBeNull();
    await fireEvent.click(removeBtn!);
    await Promise.resolve();
    expect(adminAllowListRef.value).not.toContain("yky.lee");
  });
});
