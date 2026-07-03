import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import Login from "./Login.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args)
}));

beforeEach(() => {
  pushMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Login", () => {
  it("redirects to /builds when a stored userId already exists", async () => {
    localStorage.setItem("userId", "yklee");
    render(Login);
    // onMount 가 microtask 이후에 push 를 호출.
    await Promise.resolve();
    await Promise.resolve();
    expect(pushMock).toHaveBeenCalledWith("/builds");
  });

  it("stores trimmed userId and routes to /builds on submit", async () => {
    render(Login);
    const input = screen.getByLabelText(/user id/i) as HTMLInputElement;
    input.value = "  yklee  ";
    await fireEvent.input(input, { target: { value: "  yklee  " } });
    const form = input.closest("form") as HTMLFormElement;
    await fireEvent.submit(form);
    expect(localStorage.getItem("userId")).toBe("yklee");
    expect(pushMock).toHaveBeenCalledWith("/builds");
  });

  it("does not store or route when input is empty / whitespace", async () => {
    render(Login);
    const input = screen.getByLabelText(/user id/i) as HTMLInputElement;
    input.value = "   ";
    await fireEvent.input(input, { target: { value: "   " } });
    const form = input.closest("form") as HTMLFormElement;
    await fireEvent.submit(form);
    expect(localStorage.getItem("userId")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
