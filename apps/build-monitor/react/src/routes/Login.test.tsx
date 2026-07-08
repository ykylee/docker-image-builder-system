// TASK-089: Login React 마이그레이션 RTL 검증.
//
// Svelte routes/Login.test.ts 의 3 시나리오를 RTL + jsdom 에서 동등하게
// 검증한다. Svelte 의 `svelte-spa-router` push mock 은 react-router-dom
// `useNavigate` mock 으로 옮긴다 — 호출 인자 (path + replace option)
// 까지 검증.
//
// React 19 + vitest jsdom 환경에서 useEffect 는 commit 후 microtask 에서
// fire 하므로 `await act(async () => {})` 로 drain 한 뒤 expect 한다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { USER_ID_KEY, setUserId } from "@/lib/useUserId";
import { Login } from "./Login";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

beforeEach(() => {
  navigateMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Login (React + react-router-dom)", () => {
  it("redirects to /builds when a stored userId already exists", async () => {
    localStorage.setItem(USER_ID_KEY, "yklee");

    render(<Login />);

    // useEffect 가 mount 후 fire — act 로 drain.
    await act(async () => {
      await Promise.resolve();
    });

    expect(navigateMock).toHaveBeenCalledWith("/builds", { replace: true });
  });

  it("stores trimmed userId and routes to /builds on submit", async () => {
    render(<Login />);

    const input = screen.getByLabelText(/user id/i) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "  yklee  " } });
    const form = input.closest("form") as HTMLFormElement;
    await fireEvent.submit(form);

    expect(localStorage.getItem(USER_ID_KEY)).toBe("yklee");
    expect(navigateMock).toHaveBeenCalledWith("/builds");
  });

  it("does not store or route when input is empty / whitespace", async () => {
    render(<Login />);

    const input = screen.getByLabelText(/user id/i) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "   " } });
    const form = input.closest("form") as HTMLFormElement;
    await fireEvent.submit(form);

    expect(localStorage.getItem(USER_ID_KEY)).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// TASK-089 follow-up: setUserId 의 cross-tab storage 이벤트 시뮬레이션.
// 같은 코드가 Header.svelte → React Header 마이그레이션 (TASK-090 이후)
// 시점에 재사용된다. 본 smoke 는 Login session 의 cross-tab semantics
// 가 의도대로 동작함을 보장하기 위해 1 case 포함.
describe("setUserId cross-tab semantics", () => {
  it("dispatches a storage event so cross-tab listeners (and same-tab ones, where supported) see the new value", () => {
    const onStorage = vi.fn();
    window.addEventListener("storage", onStorage);

    setUserId("remote-user");

    // jsdom 환경에서는 동일 탭 dispatchStorageEvent 가 fire 한다.
    // Safari 등 일부 환경은 동일 탭 dispatch 를 무시하지만, 우리
    // subscribe 의 listener set 순회 (notify) 가 primary cross-listener
    // 경로이므로 storage dispatch 자체는 보조 안전망.
    expect(localStorage.getItem(USER_ID_KEY)).toBe("remote-user");
    expect(onStorage).toHaveBeenCalled();
    const event = onStorage.mock.calls[0]?.[0] as StorageEvent;
    expect(event.key).toBe(USER_ID_KEY);
    expect(event.newValue).toBe("remote-user");

    window.removeEventListener("storage", onStorage);
  });

  it("dispatches storage event with newValue=null when clearing", () => {
    localStorage.setItem(USER_ID_KEY, "to-clear");
    const onStorage = vi.fn();
    window.addEventListener("storage", onStorage);

    setUserId(null);

    expect(localStorage.getItem(USER_ID_KEY)).toBeNull();
    expect(onStorage).toHaveBeenCalled();
    const event = onStorage.mock.calls[0]?.[0] as StorageEvent;
    expect(event.key).toBe(USER_ID_KEY);
    expect(event.newValue).toBeNull();

    window.removeEventListener("storage", onStorage);
  });
});