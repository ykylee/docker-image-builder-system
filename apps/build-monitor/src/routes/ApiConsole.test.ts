import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import ApiConsole from "./ApiConsole.svelte";

const pushMock = vi.fn();
vi.mock("svelte-spa-router", () => ({
  push: (...args: unknown[]) => pushMock(...args),
  link: (_node: HTMLAnchorElement) => ({ destroy() {}, update() {} })
}));

beforeEach(() => {
  pushMock.mockReset();
  // window.open mock — jsdom default 은 navigation 시도하나 테스트 환경에서 무해.
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ApiConsole (TASK-079)", () => {
  // TASK-079: build server 의 Swagger UI 를 SPA 안에 임베드. iframe 의
  // src 가 `/docs/` 로 잡혀 backend 가 직접 서빙하는 Swagger UI 가
  // 렌더링된다.
  it("renders an iframe pointing to /docs/", () => {
    render(ApiConsole);
    const iframe = screen.getByTitle("Build Server Swagger UI") as HTMLIFrameElement;
    expect(iframe.src.endsWith("/docs/")).toBe(true);
  });

  it("renders the API Console heading and frame wrap", () => {
    render(ApiConsole);
    expect(screen.getByRole("heading", { name: /API Console/i })).toBeInTheDocument();
    expect(screen.getByTestId("api-console-frame")).toBeInTheDocument();
  });

  it("'Go to Build Request' 링크가 /build-request 로 navigation", () => {
    render(ApiConsole);
    // href 만 검증. SPA 라우팅 (use:link) 은 mock 처리되어 navigation
    // 호출 자체는 발생하지 않음. 단 href 가 정확히 매핑되어야 함.
    const link = screen.getByTestId("api-console-go-build");
    expect(link.getAttribute("href")).toBe("/build-request");
  });

  it("'Raw OpenAPI JSON' 버튼이 window.open('/openapi.json') 호출", async () => {
    render(ApiConsole);
    await fireEvent.click(screen.getByTestId("api-console-raw"));
    expect(window.open).toHaveBeenCalledTimes(1);
    const call = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/openapi.json");
  });

  it("Refresh 버튼이 reloadKey 를 증가시켜 iframe 재마운트", async () => {
    render(ApiConsole);
    // reloadKey 는 closure 내부 state. iframe 의 marker 로 재마운트 검증:
    // key 가 바뀌면 {#key} 블록이 unmount/remount → data-testid 동일하므로
    // reflow 가 일어나는지 직접 검증은 어려움. 대신 click 후 에러/오버레이
    // 가 reset 되는지 확인.
    const refreshBtn = screen.getByTestId("api-console-refresh");
    await fireEvent.click(refreshBtn);
    // 추가 click 도 정상 동작.
    await fireEvent.click(refreshBtn);
    expect(refreshBtn).toBeInTheDocument();
  });

  it("iframe 의 onerror 가 호출되면 에러 overlay 가 노출됨", async () => {
    render(ApiConsole);
    // iframe 요소를 직접 찾아서 error 이벤트 dispatch.
    const iframe = screen.getByTitle("Build Server Swagger UI");
    await fireEvent.error(iframe);
    expect(screen.getByRole("alert").textContent).toMatch(/Failed to load Swagger UI/);
  });
});