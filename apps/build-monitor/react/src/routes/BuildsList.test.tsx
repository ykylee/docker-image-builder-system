// TASK-090: BuildsList (React) 검증.
//
// Svelte src/routes/BuildsList.test.ts 의 6 시나리오를 RTL + jsdom 으로
// 동등 검증. Svelte `svelte-spa-router` push mock 은 react-router-dom
// useNavigate mock 으로, `vi.mock("../lib/api")` 는 path 별 mock 으로.
// listBuilds 시그니처는 (`{ requestedBy }`) 와 동일하게 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { BuildsList } from "./BuildsList";
import { USER_ID_KEY } from "@/lib/useUserId";
import { useBuildsListStore } from "@/lib/stores/buildsListStore";

const navigateMock = vi.fn();
const listBuildsMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock("@/lib/api", () => ({
  listBuilds: (params: unknown) => listBuildsMock(params)
}));

beforeEach(() => {
  navigateMock.mockReset();
  listBuildsMock.mockReset();
  // TASK-092: store 가 페이지 lifecycle 외부에 살아있으므로 매 테스트마다
  // reset 으로 이전 테스트의 builds / loading / error / filter 상태 격리.
  useBuildsListStore.getState().reset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  useBuildsListStore.getState().reset();
  localStorage.clear();
});

function renderList(): void {
  render(
    <MemoryRouter>
      <BuildsList />
    </MemoryRouter>
  );
}

const sample = (
  appName: string,
  status: string,
  lifecycleStatus?: string
) => ({
  buildId: "00000000-0000-0000-0000-" + appName.padStart(12, "0"),
  appName,
  status,
  lifecycleStatus,
  phase: "REQUEST_ACCEPTED" as const,
  previewStatus: "NOT_REQUESTED" as const,
  previewUrl: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z"
});

// TASK-141: 손수 만든 <table> + BuildRow 가 Astryx Table 로 바뀌면서
// `data-testid="build-row"` 가 사라졌다. 검증 의도(보이는 빌드 행 수)는
// 그대로 두고, 구조 결합 대신 **시맨틱 role** 로 센다.
// `role="row"` 에는 헤더 행도 포함되므로 헤더를 제외한다.
function visibleBuildRows(): number {
  const rows = screen.queryAllByRole("row");
  const headers = screen.queryAllByRole("columnheader");
  return headers.length > 0 ? rows.length - 1 : rows.length;
}

describe("BuildsList (React)", () => {
  it("redirects to / when no userId is stored and skips listBuilds", async () => {
    renderList();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/", { replace: true }));
    expect(listBuildsMock).not.toHaveBeenCalled();
  });

  it("passes requestedBy to listBuilds when signed in", async () => {
    localStorage.setItem(USER_ID_KEY, "yklee");
    listBuildsMock.mockResolvedValue({
      builds: [sample("p-1", "QUEUED"), sample("p-2", "BUILDING")],
      nextCursor: null
    });

    renderList();

    await waitFor(() => expect(listBuildsMock).toHaveBeenCalledWith({ requestedBy: "yklee" }));
  });

  it("shows an error banner when listBuilds rejects", async () => {
    localStorage.setItem(USER_ID_KEY, "yklee");
    listBuildsMock.mockRejectedValue(new Error("boom"));

    renderList();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/boom/);
  });

  it("filters visible builds by status chip", async () => {
    localStorage.setItem(USER_ID_KEY, "yklee");
    listBuildsMock.mockResolvedValue({
      builds: [
        sample("p-1", "QUEUED", "QUEUED"),
        sample("p-2", "BUILDING", "BUILDING"),
        sample("p-3", "FAILED", "FAILED")
      ],
      nextCursor: null
    });

    renderList();

    await waitFor(() => expect(visibleBuildRows()).toBe(3));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "BUILDING" }));
    });
    await waitFor(() => expect(visibleBuildRows()).toBe(1));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "FAILED" }));
    });
    await waitFor(() => expect(visibleBuildRows()).toBe(1));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ALL" }));
    });
    await waitFor(() => expect(visibleBuildRows()).toBe(3));
  });

  it("prefers lifecycleStatus when emitted alongside legacy status", async () => {
    localStorage.setItem(USER_ID_KEY, "yklee");
    listBuildsMock.mockResolvedValue({
      builds: [sample("p-canonical", "BUILDING", "DEPLOYING")],
      nextCursor: null
    });

    renderList();

    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: /Status: DEPLOYING/i })
      ).toBeInTheDocument()
    );
  });

  it("status chip matches canonical lifecycleStatus alongside legacy status", async () => {
    localStorage.setItem(USER_ID_KEY, "yklee");
    listBuildsMock.mockResolvedValue({
      builds: [
        sample("p-legacy-build", "BUILDING", "DEPLOYING"),
        sample("p-canonical-build-success", "BUILDING", "BUILD_SUCCESS"),
        sample("p-pure-legacy", "BUILDING", "BUILDING")
      ],
      nextCursor: null
    });

    renderList();

    await waitFor(() => expect(visibleBuildRows()).toBe(3));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "BUILDING" }));
    });
    await waitFor(() => expect(visibleBuildRows()).toBe(2));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "COMPLETED" }));
    });
    await waitFor(() => expect(visibleBuildRows()).toBe(1));
  });
});