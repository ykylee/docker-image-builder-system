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
      <App />
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

  // TASK-139: /login 을 제외한 라우트는 지연 로드되므로 청크가 도착할 때까지
  // 기다려야 한다. 검증 대상(라우터가 이 경로에 이 페이지를 붙이는가)은 그대로다.
  //
  // TASK-142: findBy 기본 타임아웃(1000ms)이 전체 스위트를 함께 돌릴 때
  // 부하로 초과돼 flaky 했다. 청크 로딩을 기다리는 성격이 분명하므로
  // 타임아웃을 명시적으로 늘린다 — 로직 검증이 아니라 I/O 대기다.
  it("renders the BuildsList on /builds when signed in", async () => {
    localStorage.setItem("userId", "yklee");
    renderAt("/builds");
    expect(
      await screen.findByRole("heading", { name: "Builds" }, { timeout: 5000 })
    ).toBeInTheDocument();
  });

  it("renders the BuildDetail on /builds/:id (TASK-091)", async () => {
    renderAt("/builds/00000000-0000-0000-0000-000000000001");
    // getBuildMock 이 infinite pending — BuildDetail 의 loading state 가
    // 그대로 노출되는지 검증 (placeholder 가 mount 되지 않음).
    // TASK-139: 지연 로드라 청크 도착까지 대기 후 검사한다. 여기서 기다리는
    // 것은 **청크 로딩**이고, 검증 대상인 **BuildDetail 자체의 loading state**
    // 는 getBuild 가 영원히 pending 이므로 그대로 남아 있다 — 둘을 혼동하지 말 것.
    expect(
      await screen.findByTestId("build-detail-loading", {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Loading build 00000000-0000-0000-0000-000000000001/)
    ).toBeInTheDocument();
    // TASK-092: store 의 loading state 도 함께 true 인지 검증.
    expect(useBuildDetailStore.getState().loading).toBe(true);
    expect(useBuildDetailStore.getState().build).toBeNull();
  });
});