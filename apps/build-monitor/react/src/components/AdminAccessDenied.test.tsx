// TASK-097: AdminAccessDenied (React) 테스트.
//
// Svelte AdminAccessDenied.svelte 의 시나리오를 RTL + MemoryRouter +
// useUserId mock 으로 동등 검증. reason 별 headline + body message + 액션
// (Back to Builds / Switch user) 단언.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AdminAccessDenied } from "@/components/AdminAccessDenied";

const navigateMock = vi.fn();
const setUserIdMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock("@/lib/useUserId", () => ({
  setUserId: (value: string | null) => setUserIdMock(value)
}));

afterEach(() => {
  cleanup();
  navigateMock.mockReset();
  setUserIdMock.mockReset();
});

function renderDenied(userId: string | null, reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST"): void {
  render(
    <MemoryRouter>
      <AdminAccessDenied userId={userId} reason={reason} />
    </MemoryRouter>
  );
}

describe("AdminAccessDenied (TASK-097)", () => {
  it("renders 'Sign in required' headline + body for NO_USER", () => {
    renderDenied(null, "NO_USER");
    expect(screen.getByText(/Sign in required/)).toBeInTheDocument();
    expect(
      screen.getByText(/Please sign in to view this page/)
    ).toBeInTheDocument();
  });

  it("renders 'Admin access required' + handle for FORBIDDEN", () => {
    renderDenied("yklee", "FORBIDDEN");
    expect(screen.getByText(/Admin access required/)).toBeInTheDocument();
    expect(
      screen.getByText(/@yklee is not authorized to view admin sections/)
    ).toBeInTheDocument();
  });

  it("renders 'Admin access required' + allow-list hint for NOT_IN_ALLOW_LIST", () => {
    renderDenied("yklee", "NOT_IN_ALLOW_LIST");
    expect(screen.getByText(/Admin access required/)).toBeInTheDocument();
    expect(
      screen.getByText(/Ask an existing admin to add you/)
    ).toBeInTheDocument();
  });

  it("renders signed-in user pill (@<userId>) when userId is set", () => {
    renderDenied("yklee", "FORBIDDEN");
    // @yklee 가 body message 와 pill 양쪽에 등장하므로 code element 로
    // 좁혀서 단언.
    const codes = screen.getAllByText(/@yklee/);
    expect(codes.length).toBeGreaterThanOrEqual(2); // body + code pill
    expect(
      screen.getByText(/You are currently signed in as/)
    ).toBeInTheDocument();
  });

  it("renders 'not signed in' text when userId is null", () => {
    renderDenied(null, "NO_USER");
    expect(screen.getByText(/You are not signed in/)).toBeInTheDocument();
  });

  it("'Back to Builds' navigates to /builds", () => {
    renderDenied("yklee", "FORBIDDEN");
    const btn = screen.getByTestId("admin-denied-go-builds");
    fireEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith("/builds");
  });

  it("'Switch user' clears userId + navigates to /", () => {
    renderDenied("yklee", "FORBIDDEN");
    const btn = screen.getByTestId("admin-denied-switch-user");
    fireEvent.click(btn);
    expect(setUserIdMock).toHaveBeenCalledWith(null);
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
