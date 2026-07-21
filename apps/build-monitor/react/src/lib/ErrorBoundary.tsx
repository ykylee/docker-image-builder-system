// TASK-089 follow-up: ErrorBoundary — production white-screen 방지.
//
// React 19 의 createRoot 는 component render 중 throw 가 발생하면
// unmount 후 root 만 남기고 white screen 상태가 된다. build-monitor
// 운영 빌드는 dist-react/ 단일 구조 + SPA 라 router-level 에러도
// 그대로 노출되므로, ErrorBoundary 가 Theme/BrowserRouter 외부에서
// catch 해서 fallback UI 를 보여주는 게 안전.
//
// Svelte build-monitor 운영 baseline 과 비교 시 Svelte 측에는
// <svelte:boundary> 또는 전역 error handler 가 별도 정의되어 있지
// 않아 TASK-089 시점에 React 쪽에 1차 방어선을 둔다. 향후
// build-monitor 공통 error UX 가 필요하면 Svelte 측에도 정합.
//
// 디자인은 tokens.css CSS variable 사용 — Login 페이지와 시각
// 일관성. Theme/Astryx 는 ErrorBoundary 안에 두지 않으므로 Astryx
// 컴포넌트 자체 throw 시에도 fallback 가능.

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    // 운영 환경에서는 Sentry / OTel 같은 error reporting 으로
    // forwarding 하는 자리. TASK-089 범위는 console.error 까지.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error);
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div
          role="alert"
          style={{
            padding: "var(--dib-space-xxl)",
            fontFamily: "var(--dib-font-sans, system-ui, sans-serif)",
            color: "var(--dib-color-text-primary, inherit)",
            background: "var(--dib-color-bg-canvas, transparent)",
            minHeight: "100vh"
          }}
        >
          <h1 style={{ color: "var(--dib-color-text-primary, inherit)" }}>
            Something went wrong
          </h1>
          <p style={{ color: "var(--dib-color-text-secondary, #666)" }}>
            The build monitor encountered an unexpected error. Refresh the page
            to retry. If the problem persists, file an issue with the error
            message below.
          </p>
          <pre
            data-testid="error-boundary-message"
            style={{
              padding: "var(--dib-space-md)",
              borderRadius: "var(--dib-radius-md)",
              border: "1px solid var(--dib-color-border-subtle, #444)",
              background: "var(--dib-color-bg-surface, #111)",
              color: "var(--dib-color-text-secondary, #aaa)",
              overflow: "auto",
              fontSize: "var(--dib-size-sm, 0.875rem)"
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}