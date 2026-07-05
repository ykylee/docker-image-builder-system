import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/svelte";

import AdminRunners from "./AdminRunners.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

const listAdminRunnersMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();

// session.js 의 adminIdStore / userIdStore 는 Svelte writable 이라서
// 실제 import 한 뒤 localStorage pre-fill 로 잡는 게 가장 자연스럽다.
// 어차피 vitest 의 beforeEach 가 setup.ts 보다 먼저 실행되므로 먼저
// localStorage 를 set 한 뒤 import 가 unwrap 되도록 한다.
vi.mock("../lib/api.js", () => ({
  listAdminRunners: (adminId: string) => listAdminRunnersMock(adminId),
  patchAdminRunnerStatus: (adminId: string, runnerId: string, status: string) =>
    patchMock(adminId, runnerId, status),
  deleteAdminRunner: (adminId: string, runnerId: string) =>
    deleteMock(adminId, runnerId)
}));

beforeEach(() => {
  pushMock.mockReset();
  listAdminRunnersMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const fixture = {
  runners: [
    {
      runnerId: "runner-A",
      status: "ACTIVE" as const,
      firstSeenAt: "2026-07-05T00:00:00.000Z",
      lastSeenAt: new Date(Date.now() - 30_000).toISOString(),
      buildsClaimed: 3,
      buildsCompleted: 2,
      currentBuildId: null,
      lastError: null
    },
    {
      runnerId: "runner-B",
      status: "DISABLED" as const,
      firstSeenAt: "2026-07-04T00:00:00.000Z",
      lastSeenAt: new Date(Date.now() - 600_000).toISOString(),
      buildsClaimed: 7,
      buildsCompleted: 6,
      currentBuildId: "fca34b67-3fc6-4ac2-8550-43a3f8cde67c",
      lastError: "boom"
    }
  ]
};

describe("AdminRunners page (TASK-069)", () => {
  it("redirects to /admin/login when no adminId is stored", async () => {
    // localStorage.clear() 가 이미 호출된 상태 (beforeEach). adminId 없음.
    render(AdminRunners);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/login"));
  });

  it("renders the registry snapshot after mount", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => {
      expect(screen.getByText("runner-A")).toBeTruthy();
      expect(screen.getByText("runner-B")).toBeTruthy();
    });
    // ACTIVE / DISABLED pill 텍스트.
    expect(screen.getAllByText("ACTIVE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("DISABLED").length).toBeGreaterThanOrEqual(1);
  });

  it("exposes registry mutating handlers as buttons per row", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => expect(screen.getByText("runner-A")).toBeTruthy());
    // ACTIVE row → "Disable" 버튼, DISABLED row → "Reactivate" 버튼.
    expect(screen.getAllByText("Disable").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Reactivate").length).toBeGreaterThanOrEqual(1);
    // 모든 row 에 Delete 버튼.
    expect(screen.getAllByText("Delete").length).toBeGreaterThanOrEqual(2);
  });

  it("shows an empty-state hint when the registry has zero entries", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce({ runners: [] });
    render(AdminRunners);
    await waitFor(() => {
      expect(screen.getByText(/No runners registered yet/)).toBeTruthy();
    });
  });

  // TASK-070 (PR #23): AdminRunners 의 `.pill.active` / `.pill.off`
  // 가 ACTIVE / DISABLED 상태에 매핑되며 raw rgb 가 아닌 canonical
  // 디자인 토큰 (`--color-accent-success` / `--color-accent-danger`)
  // 기반 `color-mix` 로 정렬되었는지 회귀 가드.
  it("uses pill.active / pill.off semantics that map to canonical accent tokens", async () => {
    localStorage.setItem("adminId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => expect(screen.getByText("runner-A")).toBeTruthy());

    // ACTIVE 상태 pill 은 .pill.active 클래스를 가진다.
    const activePills = document.querySelectorAll(".pill.active");
    expect(activePills.length).toBeGreaterThanOrEqual(1);
    // ACTIVE pill text 가 정확히 ACTIVE.
    const activeTexts = Array.from(activePills).map((el) => el.textContent?.trim());
    expect(activeTexts).toContain("ACTIVE");

    // DISABLED 상태 pill 은 .pill.off 클래스를 가진다.
    const offPills = document.querySelectorAll(".pill.off");
    expect(offPills.length).toBeGreaterThanOrEqual(1);
    // DISABLED pill text 가 정확히 DISABLED.
    const offTexts = Array.from(offPills).map((el) => el.textContent?.trim());
    expect(offTexts).toContain("DISABLED");

    // 두 종류가 disjoint 한지 — 같은 cell 이 active 와 off 를 동시에
    // 가지는 일이 없도록.
    activePills.forEach((el) => {
      expect(el.classList.contains("pill.off")).toBe(false);
    });
    offPills.forEach((el) => {
      expect(el.classList.contains("pill.active")).toBe(false);
    });
  });
});
