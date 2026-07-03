import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import AdminLogin from "./AdminLogin.svelte";

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

describe("AdminLogin", () => {
  it("forwards to /admin/builds when adminId is already stored", async () => {
    localStorage.setItem("adminId", "admin");
    render(AdminLogin);
    // onMount fires synchronously after render; push should have been called.
    await new Promise((r) => setTimeout(r, 0));
    expect(pushMock).toHaveBeenCalledWith("/admin/builds");
  });

  it("stores adminId in localStorage and forwards on submit", async () => {
    render(AdminLogin);
    const input = screen.getByLabelText("Admin ID") as HTMLInputElement;
    input.value = "yky.lee";
    await fireEvent.input(input);
    const form = screen.getByRole("button", { name: "Enter Admin" }).closest("form");
    expect(form).toBeTruthy();
    await fireEvent.submit(form as HTMLFormElement);
    expect(localStorage.getItem("adminId")).toBe("yky.lee");
    expect(pushMock).toHaveBeenCalledWith("/admin/builds");
  });
});
