import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/svelte";

import AdminRunners from "./AdminRunners.svelte";

// TASK-077: AdminTabs 가 `$location` 을 구독하므로 mock store 가 필요.
// vi.hoisted 로 묶어서 hoist-safe 한 writable store 생성.
const { locStore } = vi.hoisted(() => ({
  locStore: (
    require("svelte/store") as typeof import("svelte/store")
  ).writable<string>("/admin/runners")
}));
const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} }),
  location: locStore
}));

const listAdminRunnersMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
const createAdminRunnerMock = vi.fn();

// session.js 의 userIdStore 는 Svelte writable 이라서 실제 import 한 뒤
// localStorage pre-fill 로 잡는 게 가장 자연스럽다. 어차피 vitest 의
// beforeEach 가 setup.ts 보다 먼저 실행되므로 먼저 localStorage 를 set
// 한 뒤 import 가 unwrap 되도록 한다.
//
// TASK-076: adminIdStore 가 사라졌다. userId 가 곧 admin id 이고
// `X-Admin-Id` 헤더에도 그대로 실린다.
vi.mock("../lib/api.js", () => ({
  listAdminRunners: (adminId: string) => listAdminRunnersMock(adminId),
  patchAdminRunnerStatus: (adminId: string, runnerId: string, status: string) =>
    patchMock(adminId, runnerId, status),
  deleteAdminRunner: (adminId: string, runnerId: string) =>
    deleteMock(adminId, runnerId),
  // TASK-077: RegisterRunnerModal 의 submit 이 호출 — adminId 와
  // body 가 정합으로 전달되어야 하고, 성공/실패 응답이 admin UI 의
  // 모달 close / inline error 표시에 정확히 매핑되어야 한다.
  createAdminRunner: (adminId: string, body: { runnerId: string }) =>
    createAdminRunnerMock(adminId, body)
}));
// TASK-084: ensureAdminAccess mock — 기본값은 admin 통과.
const ensureAdminAccessMock = vi.fn();
vi.mock("../lib/admin-guard.js", () => ({
  ensureAdminAccess: (callerId: string) => ensureAdminAccessMock(callerId)
}));

beforeEach(() => {
  pushMock.mockReset();
  listAdminRunnersMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
  createAdminRunnerMock.mockReset();
  ensureAdminAccessMock.mockReset();
  ensureAdminAccessMock.mockResolvedValue({
    isAdmin: true,
    allowList: ["admin"],
    reason: "NOT_IN_ALLOW_LIST"
  });
  localStorage.clear();
  locStore.set("/admin/runners");
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

describe("AdminRunners page (TASK-069 + TASK-076 + TASK-077)", () => {
  // TASK-077: 페이지 상단에 admin 섹션 탭이 노출된다.
  it("renders the AdminTabs nav with all 4 sections", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce({ runners: [] });
    render(AdminRunners);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Builds" })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runners" })).toBeInTheDocument();
  });

  // TASK-076: userId 가 없으면 Login 페이지(`/`) 로 redirect.
  it("redirects to / when no userId is stored", async () => {
    // localStorage.clear() 가 이미 호출된 상태 (beforeEach). userId 없음.
    render(AdminRunners);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("renders the registry snapshot after mount", async () => {
    // TASK-076: admin 권한은 userId 그 자체. localStorage 의 userId 가 곧
    // admin id 이고 X-Admin-Id 헤더에도 그대로 실린다.
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
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
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce({ runners: [] });
    render(AdminRunners);
    await waitFor(() => {
      expect(screen.getByText(/No runners registered yet/)).toBeTruthy();
    });
  });

  // TASK-070 (PR #23) + TASK-072 (PR #25) 회귀 가드. v1 (PR #23) 의
  // inline `<span class="pill active/off">` 가 canonical `<StatusPill>`
  // 컴포넌트로 승격됨. StatusPill 의 colorFor 매핑에 RunnerStatus
  // (ACTIVE / DISABLED) 가 추가되어 (TASK-072) 디자인 토큰 정렬 + semantic
  // 색상이 그대로 승계된다.
  it("renders ACTIVE / DISABLED runner status via canonical StatusPill with semantic tokens", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => expect(screen.getByText("runner-A")).toBeTruthy());

    // ACTIVE runner 의 StatusPill 이 "Status: ACTIVE" aria-label 로 노출.
    const activePill = screen.getByRole("status", { name: "Status: ACTIVE" });
    expect(activePill).toBeInTheDocument();
    // inline `--pill-color` 가 canonical success 토큰.
    expect((activePill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-accent-success)"
    );

    // DISABLED runner 의 StatusPill 이 "Status: DISABLED" aria-label 로 노출.
    const disabledPill = screen.getByRole("status", { name: "Status: DISABLED" });
    expect(disabledPill).toBeInTheDocument();
    // inline `--pill-color` 가 canonical danger 토큰.
    expect((disabledPill as HTMLElement).style.getPropertyValue("--pill-color")).toBe(
      "var(--color-accent-danger)"
    );

    // 두 StatusPill 이 disjoint (서로 다른 element).
    expect(activePill).not.toBe(disabledPill);
  });

  // TASK-072 회귀 가드: inline `.pill` 클래스 (raw rgb 디자인) 가 더는
  // 노출되지 않음 — canonical StatusPill 으로 전면 전환된 결과.
  // (이전 PR #23 의 `.pill.active` / `.pill.off` 셀렉터는 StatusPill 의
  // component-scoped `.pill` (hashed) 와 매치 안 되므로 회귀가드 의미
  // 자체가 canonical 승격으로 무효화됨.)
  it("no longer exposes inline pill.active / pill.off raw-rgb design", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce(fixture);
    render(AdminRunners);
    await waitFor(() => expect(screen.getByText("runner-A")).toBeTruthy());

    // inline `.pill.active` / `.pill.off` (raw rgb 디자인) 가 더는 매치 안 됨.
    // 모든 StatusPill 의 .pill (component-scoped, hashed) 만 존재.
    expect(document.querySelectorAll(".pill.active").length).toBe(0);
    expect(document.querySelectorAll(".pill.off").length).toBe(0);
  });

  // TASK-084: 비-admin user 의 deep link 진입 시 backend 호출 없이
  // frontend 에서 거부 → AdminAccessDenied 패널 노출.
  it("shows AdminAccessDenied panel when caller is not in the admin allow-list", async () => {
    localStorage.setItem("userId", "alice");
    ensureAdminAccessMock.mockResolvedValueOnce({
      isAdmin: false,
      allowList: ["admin", "yky.lee"],
      reason: "NOT_IN_ALLOW_LIST"
    });
    render(AdminRunners);
    await waitFor(() =>
      expect(screen.getByText(/Admin access required/i)).toBeInTheDocument()
    );
    expect(listAdminRunnersMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("admin-denied-go-builds")).toBeInTheDocument();
  });
});

// TASK-077: admin-initiated runner registration via the "+ Register Runner"
// button. Modal 안에서 adminId + body 가 정합으로 전달되어야 하고, 성공/
// 실패 응답이 modal close / inline error 표시에 정확히 매핑되어야 한다.
describe("AdminRunners + Register Runner modal (TASK-077)", () => {
  it("renders a '+ Register Runner' button in the page header", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce({ runners: [] });
    render(AdminRunners);
    await waitFor(() =>
      expect(
        screen.getByTestId("register-runner-open")
      ).toBeInTheDocument()
    );
    expect(screen.getByTestId("register-runner-open").textContent).toMatch(
      /Register Runner/
    );
  });

  it("clicking the button opens the modal with an input field", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValueOnce({ runners: [] });
    render(AdminRunners);
    const openBtn = await waitFor(() =>
      screen.getByTestId("register-runner-open")
    );
    openBtn.click();
    await waitFor(() =>
      expect(
        screen.getByTestId("register-runner-modal")
      ).toBeInTheDocument()
    );
    expect(screen.getByTestId("register-runner-input")).toBeInTheDocument();
    expect(screen.getByTestId("register-runner-submit")).toBeInTheDocument();
  });

  it("successful submit closes the modal, calls createAdminRunner, and refreshes the list", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock
      .mockResolvedValueOnce({ runners: [] }) // initial load
      .mockResolvedValueOnce({
        // refresh() after success
        runners: [
          {
            runnerId: "runner-pre-1",
            status: "ACTIVE",
            firstSeenAt: "2026-07-07T00:00:00.000Z",
            lastSeenAt: "2026-07-07T00:00:00.000Z",
            buildsClaimed: 0,
            buildsCompleted: 0,
            currentBuildId: null,
            lastError: null
          }
        ]
      });
    createAdminRunnerMock.mockResolvedValueOnce({
      runner: {
        runnerId: "runner-pre-1",
        status: "ACTIVE",
        firstSeenAt: "2026-07-07T00:00:00.000Z",
        lastSeenAt: "2026-07-07T00:00:00.000Z",
        buildsClaimed: 0,
        buildsCompleted: 0,
        currentBuildId: null,
        lastError: null
      }
    });
    render(AdminRunners);
    const openBtn = await waitFor(() =>
      screen.getByTestId("register-runner-open")
    );
    openBtn.click();
    const input = (await waitFor(() =>
      screen.getByTestId("register-runner-input")
    )) as HTMLInputElement;
    const submit = (await waitFor(() =>
      screen.getByTestId("register-runner-submit")
    )) as HTMLButtonElement;
    input.value = "runner-pre-1";
    // input dispatch change event for Svelte two-way binding.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    submit.click();
    await waitFor(() => {
      expect(createAdminRunnerMock).toHaveBeenCalledWith("admin", {
        runnerId: "runner-pre-1"
      });
    });
    // list 가 refresh 로 두 번째 호출되는지 — initial + refresh.
    await waitFor(() => {
      expect(listAdminRunnersMock).toHaveBeenCalledTimes(2);
    });
    // modal 이 close 되었는지 — modal element 가 없어야 함.
    expect(screen.queryByTestId("register-runner-modal")).toBeNull();
  });

  it("a 409 (duplicate) error keeps the modal open and shows an inline message", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValue({ runners: [] });
    // createAdminRunner 가 409 시뮬레이션 — api.ts helper 가
    // `throw new Error(\`409: Runner already registered.\`)` 와 같이 던진다는
    // contract 와 정합.
    createAdminRunnerMock.mockRejectedValueOnce(
      new Error("409: Runner already registered.")
    );
    render(AdminRunners);
    const openBtn = await waitFor(() =>
      screen.getByTestId("register-runner-open")
    );
    openBtn.click();
    const input = (await waitFor(() =>
      screen.getByTestId("register-runner-input")
    )) as HTMLInputElement;
    const submit = (await waitFor(() =>
      screen.getByTestId("register-runner-submit")
    )) as HTMLButtonElement;
    input.value = "runner-dup";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    submit.click();
    // inline error 메시지 가 보여야 함.
    await waitFor(() =>
      expect(
        screen.getByTestId("register-runner-error")
      ).toBeInTheDocument()
    );
    expect(
      screen.getByTestId("register-runner-error").textContent
    ).toMatch(/409/);
    // modal 은 여전히 open (error 시 close 안 함).
    expect(
      screen.getByTestId("register-runner-modal")
    ).toBeInTheDocument();
    // refresh 가 호출되지 않아야 함 (실패했으므로).
    expect(listAdminRunnersMock).toHaveBeenCalledTimes(1);
  });

  it("a 400 (invalid body) error from the backend also keeps the modal open with the message", async () => {
    localStorage.setItem("userId", "admin");
    listAdminRunnersMock.mockResolvedValue({ runners: [] });
    createAdminRunnerMock.mockRejectedValueOnce(
      new Error("400: Invalid body (empty runnerId, extra fields, type mismatch).")
    );
    render(AdminRunners);
    const openBtn = await waitFor(() =>
      screen.getByTestId("register-runner-open")
    );
    openBtn.click();
    const input = (await waitFor(() =>
      screen.getByTestId("register-runner-input")
    )) as HTMLInputElement;
    const submit = (await waitFor(() =>
      screen.getByTestId("register-runner-submit")
    )) as HTMLButtonElement;
    input.value = "  "; // whitespace only — client-side pre-validation에서
    // 4xx 가 나지 않을 수 있지만, server-side 400 시에도 modal 이 close
    // 안 하고 inline error 가 surface 되어야 한다.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    submit.click();
    await waitFor(() =>
      expect(
        screen.getByTestId("register-runner-error")
      ).toBeInTheDocument()
    );
    expect(
      screen.getByTestId("register-runner-modal")
    ).toBeInTheDocument();
  });
});
