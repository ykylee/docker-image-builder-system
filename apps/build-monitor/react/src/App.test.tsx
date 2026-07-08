// TASK-089/090: App shell (router) 검증.
//
// Login.test.tsx / BuildsList.test.tsx 가 각 컴포넌트 자체의 시나리오를
// 검증하는 동안, App.test.tsx 는 라우터 통합 —
//   /        → Navigate → /login (Login 폼 렌더)
//   /login   → Login 폼 렌더
//   /builds  → BuildsList (TASK-090; userId setItem + listBuilds mock)
//   /builds/:id → BuildDetailPlaceholder (TASK-091 예정)
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

const listBuildsMock = vi.fn();
vi.mock("@/lib/api", () => ({
  listBuilds: (params: unknown) => listBuildsMock(params)
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

  it("renders the BuildDetailPlaceholder on /builds/:id (TASK-091 예정)", () => {
    renderAt("/builds/00000000-0000-0000-0000-000000000001");
    expect(screen.getByTestId("build-detail-placeholder")).toBeInTheDocument();
  });
});