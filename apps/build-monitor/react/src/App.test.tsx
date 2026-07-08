// TASK-089: App shell (router) 검증.
//
// Login.test.tsx 가 Login 컴포넌트 자체의 3 시나리오 (redirect, store,
// empty submit) 를 검증하는 동안, App.test.tsx 는 라우터 통합 —
//   /        → Navigate → /login (Login 폼 렌더)
//   /login   → Login 폼 렌더
//   /builds  → BuildsPlaceholder (TASK-090 에서 Svelte BuildsList
//              마이그레이션 시 교체)
//   *        → Navigate → /login fallback
// 을 MemoryRouter initialEntries 로 검증한다.
//
// vitest + RTL + jsdom 환경에서 react-router-dom 은 BrowserRouter 의
// history API 보다 MemoryRouter 가 안정적 — URL state 를 메모리 안에서
// 관리하므로 jsdom 의 window.history 의존을 피한다.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

import { App } from "@/App";

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Theme theme={neutralTheme}>
        <App />
      </Theme>
    </MemoryRouter>
  );
}

describe("App (router shell)", () => {
  it("renders the Login form on /login", () => {
    renderAt("/login");
    expect(screen.getByLabelText(/user id/i)).toBeInTheDocument();
  });

  it("redirects / to /login and renders the Login form", () => {
    renderAt("/");
    expect(screen.getByLabelText(/user id/i)).toBeInTheDocument();
  });

  it("renders the BuildsPlaceholder on /builds (TASK-090 예정)", () => {
    renderAt("/builds");
    expect(screen.getByTestId("builds-placeholder")).toBeInTheDocument();
  });
});