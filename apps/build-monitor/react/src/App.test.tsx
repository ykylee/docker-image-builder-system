// TASK-089/090/091: App shell (router) 검증.
//
// Login.test.tsx / BuildsList.test.tsx / BuildDetail.test.tsx 가 각
// 컴포넌트 자체의 시나리오를 검증하는 동안, App.test.tsx 는 라우터 통합 —
//   /        → Navigate → /login (Login 폼 렌더)
//   /login   → Login 폼 렌더
//   /builds  → BuildsList (TASK-090; userId setItem + listBuilds mock)
//   /builds/:id → BuildDetail (TASK-091; loading state + buildId 표시)
//   *        → Navigate → /login fallback
// 을 MemoryRouter initialEntries 로 검증한다.
//
// vitest + RTL + jsdom 환경에서 react-router-dom 은 BrowserRouter 의
// history API 보다 MemoryRouter 가 안정적 — URL state 를 메모리 안에서
// 관리하므로 jsdom 의 window.history 의존을 피한다.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

import { App } from "@/App";
import { useBuildsListStore } from "@/lib/stores/buildsListStore";
import { useBuildDetailStore } from "@/lib/stores/buildDetailStore";

const listBuildsMock = vi.fn();
const getBuildMock = vi.fn();
const getBuildLogsMock = vi.fn();
vi.mock("@/lib/api", () => ({
  listBuilds: (params: unknown) => listBuildsMock(params),
  getBuild: (id: string) => getBuildMock(id),
  getBuildLogs: (id: string) => getBuildLogsMock(id)
}));

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Theme theme={neutralTheme}>
        <App />
      </Theme>
    </MemoryRouter>
  );
}

beforeEach(() => {
  listBuildsMock.mockReset();
  listBuildsMock.mockResolvedValue({ builds: [], nextCursor: null });
  // BuildDetail 의 getBuild / getBuildLogs 가 resolve 안 되면 loading state
  // 가 그대로 남아 있어 회귀 가드 (placeholder 가 mount 되지 않음) 가 가능.
  // infinite promise 로 명시적 "영원히 pending" 상태를 만들어 loading
  // placeholder 가 mount 되는지 확인.
  getBuildMock.mockReset();
  getBuildMock.mockImplementation(
    () => new Promise(() => undefined)
  );
  getBuildLogsMock.mockReset();
  getBuildLogsMock.mockImplementation(
    () => new Promise(() => undefined)
  );
  // TASK-092: store 격리 — 매 테스트마다 reset 으로 이전 테스트 상태 누수 차단.
  useBuildsListStore.getState().reset();
  useBuildDetailStore.getState().reset();
  localStorage.clear();
});

describe("App (router shell)", () => {
  it("renders the Login form on /login", () => {
    renderAt("/login");
    expect(screen.getByLabelText(/user id/i)).toBeInTheDocument();
  });

  it("redirects / to /login and renders the Login form", () => {
    renderAt("/");
    expect(screen.getByLabelText(/user id/i)).toBeInTheDocument();
  });

  it("renders the BuildsList on /builds when signed in", () => {
    localStorage.setItem("userId", "yklee");
    renderAt("/builds");
    expect(screen.getByRole("heading", { name: "Builds" })).toBeInTheDocument();
  });

  it("renders the BuildDetail on /builds/:id (TASK-091)", async () => {
    renderAt("/builds/00000000-0000-0000-0000-000000000001");
    // getBuildMock 이 infinite pending — BuildDetail 의 loading state 가
    // 그대로 노출되는지 검증 (placeholder 가 mount 되지 않음).
    expect(screen.getByTestId("build-detail-loading")).toBeInTheDocument();
    expect(
      screen.getByText(/Loading build 00000000-0000-0000-0000-000000000001/)
    ).toBeInTheDocument();
    // TASK-092: store 의 loading state 도 함께 true 인지 검증.
    expect(useBuildDetailStore.getState().loading).toBe(true);
    expect(useBuildDetailStore.getState().build).toBeNull();
  });
});