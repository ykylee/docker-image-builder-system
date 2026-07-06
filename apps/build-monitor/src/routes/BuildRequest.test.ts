import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import BuildRequest from "./BuildRequest.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

const submitBuildRequestMock = vi.fn();
vi.mock("../lib/api", () => ({
  submitBuildRequest: (payload: unknown) => submitBuildRequestMock(payload)
}));

// admin-store: 비어있는 list. userId store 만 신경쓰면 됨.
const adminAllowListRef: { value: string[] } = { value: [] };
vi.mock("../lib/admin-store.js", () => {
  const inner = (require("svelte/store") as typeof import("svelte/store")).writable<string[]>([]);
  return {
    adminAllowListStore: {
      subscribe: inner.subscribe,
      snapshot: () => adminAllowListRef.value,
      contains: () => false,
      refresh: async () => inner.set(adminAllowListRef.value),
      add: async () => ({ admins: [] }),
      remove: async () => ({ removed: "", admins: [] })
    }
  };
});

import { userIdStore } from "../lib/session.js";

beforeEach(() => {
  pushMock.mockReset();
  submitBuildRequestMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  userIdStore.set(null);
});

describe("BuildRequest (TASK-079)", () => {
  // TASK-079: skill 측 build request UI 의 핵심 진입점. userId 가 없으면
  // Login 페이지(`/`) 로 redirect — 다른 인증 필요 route 와 동일 패턴.
  it("redirects to / when no userId is stored", async () => {
    render(BuildRequest);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(submitBuildRequestMock).not.toHaveBeenCalled();
  });

  it("renders the form with default 'hello' preset values when userId is set", async () => {
    userIdStore.set("alice");
    render(BuildRequest);
    // onMount → userId 확인 → applyPreset('hello') 가 default.
    // 비동기지만 svelte 5 의 $state reactive 로 즉시 반영.
    await waitFor(() => {
      const appNameInput = screen.getByTestId("req-appName") as HTMLInputElement;
      // appName 은 ts 기반이라 'hello-' prefix 만 검증 (전체는 timestamp 가짐)
      expect(appNameInput.value.startsWith("hello-")).toBe(true);
    });
    expect((screen.getByTestId("req-requestedBy") as HTMLInputElement).value).toBe("alice");
    expect((screen.getByTestId("req-entrypoint") as HTMLInputElement).value).toBe("src/index.ts");
    expect((screen.getByTestId("req-dockerfile") as HTMLInputElement).value).toBe("Dockerfile");
  });

  it("applies the 'typescript' preset and shows 'ts-app-' prefix", async () => {
    userIdStore.set("alice");
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-entrypoint") as HTMLInputElement).value).toBe("src/index.ts")
    );
    // ts preset 버튼을 찾아 클릭. textContent 는 "TypeScript".
    const tsBtn = screen.getByRole("button", { name: /TypeScript/i });
    await fireEvent.click(tsBtn);
    const appName = (screen.getByTestId("req-appName") as HTMLInputElement).value;
    expect(appName.startsWith("ts-app-")).toBe(true);
    expect((screen.getByTestId("req-entrypoint") as HTMLInputElement).value).toBe("src/server.ts");
  });

  it("applies the 'minimal' preset with python entrypoint", async () => {
    userIdStore.set("alice");
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-entrypoint") as HTMLInputElement).value).toBe("src/index.ts")
    );
    const minBtn = screen.getByRole("button", { name: /Minimal/i });
    await fireEvent.click(minBtn);
    expect((screen.getByTestId("req-entrypoint") as HTMLInputElement).value).toBe("main.py");
    expect((screen.getByTestId("req-appName") as HTMLInputElement).value.startsWith("minimal-")).toBe(true);
  });

  it("randomizeAppName 버튼이 appName 을 'random-' prefix 로 변경", async () => {
    userIdStore.set("alice");
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    const rndBtn = screen.getByRole("button", { name: /Random appName/i });
    await fireEvent.click(rndBtn);
    expect((screen.getByTestId("req-appName") as HTMLInputElement).value.startsWith("random-")).toBe(true);
  });

  it("submits BuildRequest payload and shows accepted result", async () => {
    userIdStore.set("alice");
    submitBuildRequestMock.mockResolvedValue({
      accepted: true,
      duplicate: false,
      build: {
        buildId: "11111111-1111-4111-8111-111111111111",
        appName: "hello-test",
        status: "QUEUED",
        phase: "REQUEST_ACCEPTED",
        previewStatus: "NOT_REQUESTED",
        previewUrl: null,
        createdAt: "2026-07-06T05:00:00.000Z",
        updatedAt: "2026-07-06T05:00:00.000Z"
      }
    });
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    await fireEvent.click(screen.getByTestId("req-submit"));
    await waitFor(() => expect(submitBuildRequestMock).toHaveBeenCalled());
    // 응답 패널 노출 확인.
    await waitFor(() => {
      expect(screen.getByTestId("req-result")).toBeInTheDocument();
      // accepted 배지의 text 가 "202 Accepted" 포함.
      expect(screen.getByText(/202 Accepted/i)).toBeInTheDocument();
    });
    // submit 호출 시 payload 구조 검증 — BuildRequest schema 와 1:1 매칭.
    const lastCall = submitBuildRequestMock.mock.calls[0][0];
    expect(lastCall.appName.startsWith("hello-")).toBe(true);
    expect(lastCall.requestedBy).toBe("alice");
    expect(lastCall.sourceArchive.objectKey).toMatch(/^ref:\/\//);
    expect(lastCall.sourceArchive.checksumSha256).toHaveLength(64);
    expect(lastCall.entrypointPath).toBe("src/index.ts");
    expect(lastCall.dockerfilePath).toBe("Dockerfile");
    expect(typeof lastCall.previewTtlMinutes).toBe("number");
  });

  it("shows duplicate result panel when backend returns 409 envelope", async () => {
    userIdStore.set("alice");
    submitBuildRequestMock.mockResolvedValue({
      accepted: false,
      duplicate: true,
      reason: "ACTIVE_BUILD_EXISTS",
      build: {
        buildId: "22222222-2222-4222-8222-222222222222",
        appName: "hello-dup",
        status: "QUEUED",
        phase: "REQUEST_ACCEPTED",
        previewStatus: "NOT_REQUESTED",
        previewUrl: null,
        createdAt: "2026-07-06T05:00:00.000Z",
        updatedAt: "2026-07-06T05:00:00.000Z"
      }
    });
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    await fireEvent.click(screen.getByTestId("req-submit"));
    await waitFor(() => {
      expect(screen.getByText(/409 Duplicate/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/ACTIVE_BUILD_EXISTS/)).toBeInTheDocument();
  });

  it("shows error banner when submit throws", async () => {
    userIdStore.set("alice");
    submitBuildRequestMock.mockRejectedValue(new Error("network down"));
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    await fireEvent.click(screen.getByTestId("req-submit"));
    const banner = await screen.findByTestId("req-error");
    expect(banner.textContent).toMatch(/network down/);
  });

  it("shows JSON payload preview in the details block", async () => {
    userIdStore.set("alice");
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    const summary = screen.getByText(/Raw payload preview/i);
    expect(summary).toBeInTheDocument();
  });

  it("'View Builds list' 버튼이 /builds 로 push", async () => {
    userIdStore.set("alice");
    render(BuildRequest);
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    await fireEvent.click(screen.getByTestId("req-cancel"));
    expect(pushMock).toHaveBeenCalledWith("/builds");
  });
});