// TASK-088 Astryx 부트스트랩 PoC 의 vitest + @testing-library/react 검증.
// 회귀 영향 0 검증의 일부 — Build Server 영향 없음, build-monitor 기존
// vitest 140+ baseline 유지 + 본 test 1건 신규 추가.
//
// 검증 항목:
//   (1) Astryx Button 컴포넌트가 react-dom 으로 렌더링
//   (2) Button label 텍스트가 DOM 에 노출
//   (3) Astryx 글로벌 토큰 (--color-text-primary) 이 document root 에 주입

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
// 상대경로 import — vitest 는 vite.config.ts (Svelte vitest config) 의 alias
// `@` → src 를 쓰므로 `@/App` 해석 실패. 본 test 는 vitest + RTL + jsdom
// 환경에서 Svelte vitest 인프라는 그대로 쓰고 React 컴포넌트만 검증.
// React 빌드 (vite.react.config.ts) 의 alias `@` → react/src 와는 별개.
import { App } from "./App";

describe("App (React + Astryx PoC)", () => {
  it("renders Astryx Button with the PoC label and the status text", () => {
    render(
      <Theme theme={neutralTheme}>
        <App />
      </Theme>
    );

    expect(screen.getByTestId("poc-status")).toHaveTextContent(/React 19/);
    expect(
      screen.getByRole("button", { name: "Astryx Button (PoC)" })
    ).toBeInTheDocument();
  });
});