// TASK-140: LogStream 테스트.
//
// 이관 전 LogStream 은 엔트리별 `<span>` 을 직접 렌더해 구조가 곧 계약이었고,
// BuildDetail.test.tsx 가 `log-entry` 개수로 그것을 확인했다. Astryx
// `CodeBlock` 으로 옮기면서 렌더 결과가 **한 덩어리 코드 문자열 + 토큰** 이
// 됐으므로, 계약도 그에 맞게 여기서 직접 고정한다.
//
// 특히 **토크나이저**는 조용히 깨지기 쉽다 — 색이 안 입혀져도 텍스트는 그대로
// 보이므로 화면만 봐서는 회귀를 알아채기 어렵다. 그래서 색 구분이 실제로
// 적용되는지를 토큰 요소 단위로 확인한다.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LogStream } from "@/components/LogStream";
import type { BuildLogEntry } from "@/lib/api";

const ENTRIES = [
  {
    id: "1",
    buildId: "b1",
    phase: "REQUEST_ACCEPTED",
    message: "Build request accepted",
    createdAt: "2026-07-22T01:02:03.000Z"
  },
  {
    id: "2",
    buildId: "b1",
    phase: "DOCKER_BUILD_STARTED",
    message: "docker build started",
    createdAt: "2026-07-22T01:02:09.000Z"
  }
] as unknown as BuildLogEntry[];

// 이 저장소는 RTL 자동 cleanup 을 쓰지 않는다 (다른 테스트 파일들도 명시 호출).
// 없으면 렌더가 누적돼 getByTestId 가 "여러 개 발견" 으로 죽는다.
afterEach(cleanup);

function logText(): string {
  return screen.getByTestId("log-stream-pre").textContent ?? "";
}

describe("LogStream", () => {
  it("엔트리를 `HH:MM:SS [PHASE] message` 로 렌더한다", () => {
    render(<LogStream entries={ENTRIES} />);
    const text = logText();

    expect(text).toContain("01:02:03");
    expect(text).toContain("[REQUEST_ACCEPTED]");
    expect(text).toContain("Build request accepted");
    expect(text).toContain("01:02:09");
    expect(text).toContain("[DOCKER_BUILD_STARTED]");
    expect(text).toContain("docker build started");
  });

  it("ISO 8601 에서 시각 부분만 잘라 쓴다 (날짜는 노출하지 않는다)", () => {
    // 운영자가 빠르게 스캔하도록 HH:MM:SS 만 보여주는 것이 TASK-091 의 의도다.
    render(<LogStream entries={ENTRIES} />);
    expect(logText()).not.toContain("2026-07-22");
  });

  it("타임스탬프와 [PHASE] 에 서로 다른 색이 입혀진다", () => {
    // 토크나이저가 죽으면 텍스트는 그대로 보이고 색만 사라진다 — 화면으로는
    // 알아채기 어려우므로 토큰 요소를 직접 확인한다.
    render(<LogStream entries={ENTRIES} />);
    const pre = screen.getByTestId("log-stream-pre");

    const colored = [...pre.querySelectorAll("span")].filter(
      (el) => el.children.length === 0 && el.textContent?.trim()
    );
    const timeToken = colored.find((el) => el.textContent === "01:02:03");
    const phaseToken = colored.find(
      (el) => el.textContent === "[REQUEST_ACCEPTED]"
    );

    expect(timeToken, "타임스탬프가 별도 토큰으로 분리되지 않았다").toBeDefined();
    expect(phaseToken, "[PHASE] 가 별도 토큰으로 분리되지 않았다").toBeDefined();

    const timeColor = getComputedStyle(timeToken as Element).color;
    const phaseColor = getComputedStyle(phaseToken as Element).color;

    // 둘 다 빈 값이면 아래 "서로 다르다" 단언이 공허하게 통과한다 — 색이
    // 실제로 지정돼 있는지 먼저 확인한다.
    expect(timeColor, "타임스탬프에 색이 지정되지 않았다").not.toBe("");
    expect(phaseColor, "[PHASE] 에 색이 지정되지 않았다").not.toBe("");
    expect(
      timeColor,
      "타임스탬프와 PHASE 가 같은 색이면 스캔 목적이 사라진다"
    ).not.toBe(phaseColor);
  });

  it("형식이 어긋난 줄에는 색을 입히지 않는다 (추측하지 않는다)", () => {
    const odd = [
      {
        id: "9",
        buildId: "b1",
        phase: "x",
        message: "no timestamp here",
        createdAt: "not-an-iso-date"
      }
    ] as unknown as BuildLogEntry[];

    render(<LogStream entries={odd} />);
    // 죽지 않고 메시지는 그대로 보여야 한다.
    expect(logText()).toContain("no timestamp here");
  });

  it("wrap 토글이 동작한다", () => {
    render(<LogStream entries={ENTRIES} />);
    const toggle = screen.getByTestId("log-stream-wrap") as HTMLInputElement;

    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
  });

  it("복사 버튼을 제공한다 (이관 전에는 없던 기능)", () => {
    // 운영자가 실패한 빌드 로그를 공유하려면 이전에는 드래그 선택뿐이었다.
    render(<LogStream entries={ENTRIES} />);
    expect(
      screen.getByRole("button", { name: /copy/i })
    ).toBeInTheDocument();
  });

  it("엔트리가 없으면 빈 로그를 렌더한다", () => {
    render(<LogStream entries={[]} />);
    // CodeBlock 은 비어도 zero-width space 를 렌더한다.
    expect(logText().replace(/​/g, "")).toBe("");
  });
});
