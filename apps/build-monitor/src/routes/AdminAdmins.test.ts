import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import AdminAdmins from "./AdminAdmins.svelte";

// TASK-077: AdminTabs 가 `$location` 을 구독하므로 mock store 가 필요.
// vi.hoisted 로 묶어서 hoist-safe 한 writable store 생성.
const { locStore } = vi.hoisted(() => ({
  locStore: (
    require("svelte/store") as typeof import("svelte/store")
  ).writable<string>("/admin/admins")
}));
const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} }),
  location: locStore
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
  locStore.set("/admin/admins");
});

afterEach(() => {
  cleanup();
  setAdminAllowList([]);
});

describe("AdminAdmins (TASK-049 + TASK-076 + TASK-077)", () => {
  // TASK-077: 페이지 상단에 admin 섹션 탭이 노출된다.
  it("renders the AdminTabs nav with all 4 sections", async () => {
    localStorage.setItem("userId", "admin");
    setAdminAllowList(["admin"]);
    render(AdminAdmins);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Builds" })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runners" })).toBeInTheDocument();
  });

  // TASK-076: userId 가 없으면 Login 페이지(`/`) 로 redirect.
  it("redirects to / when no userId is stored", async () => {
    render(AdminAdmins);
    // onMount 마이크로태스크 끝난 뒤
    await Promise.resolve();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("renders the allow-list with seed protected", async () => {
    // TASK-076: admin 권한은 userId 그 자체. localStorage 의 userId 가 곧
    // admin id 이고 X-Admin-Id 헤더에도 그대로 실린다.
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
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

describe("AdminAdmins input validation (TASK-049 follow-up)", () => {
  it("rejects an adminId that fails the canonical pattern", async () => {
    localStorage.setItem("userId", "admin");
    setAdminAllowList(["admin"]);
    render(AdminAdmins);
    await Promise.resolve();
    await Promise.resolve();
    const input = screen.getByPlaceholderText("userId") as HTMLInputElement;
    // 공백 포함 id — 정규식 위반.
    await fireEvent.input(input, { target: { value: "bad id" } });
    const submit = screen.getByRole("button", { name: /add admin/i });
    await fireEvent.click(submit);
    // store 는 그대로, error banner 노출.
    expect(adminAllowListRef.value).toEqual(["admin"]);
    expect(
      screen.getByText(/letters \/ digits \/ dot \/ underscore \/ hyphen/)
    ).toBeInTheDocument();
  });

  it("rejects a path-like adminId (slash)", async () => {
    localStorage.setItem("userId", "admin");
    setAdminAllowList(["admin"]);
    render(AdminAdmins);
    await Promise.resolve();
    await Promise.resolve();
    const input = screen.getByPlaceholderText("userId") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "a/b" } });
    const submit = screen.getByRole("button", { name: /add admin/i });
    await fireEvent.click(submit);
    expect(adminAllowListRef.value).toEqual(["admin"]);
  });
});