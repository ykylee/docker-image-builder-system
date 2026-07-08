// TASK-089 follow-up: ErrorBoundary 검증.
//
// React 19 ErrorBoundary 는 class component 만 가능 (함수형 hook 없음).
// 자식에서 throw 가 발생하면 fallback UI 가 렌더되고, 자식이 정상
// 이면 children 그대로 노출된다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ErrorBoundary } from "@/lib/ErrorBoundary";

function Throw({ message }: { message: string }): null {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // ErrorBoundary.componentDidCatch 가 console.error 를 호출하므로
    // jsdom 의 React error 출력까지 더해져 테스트 stderr 가 시끄러워
    // 진다. 의도적인 error throw 케이스만 mock.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it("renders fallback UI with the error message when a child throws", () => {
    render(
      <ErrorBoundary>
        <Throw message="boom from child" />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("error-boundary-message")).toHaveTextContent(
      /boom from child/
    );
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div data-testid="safe-child">safe content</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("safe-child")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls componentDidCatch with the thrown error", () => {
    render(
      <ErrorBoundary>
        <Throw message="logged error" />
      </ErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    const firstCallArgs = consoleErrorSpy.mock.calls[0] ?? [];
    const formatted = firstCallArgs
      .map((arg) => (typeof arg === "string" ? arg : ""))
      .join(" ");
    expect(formatted).toMatch(/ErrorBoundary|logged error/);
  });
});