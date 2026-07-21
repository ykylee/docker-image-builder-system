// TASK-099 (M4.5 Group E): BuildRequest (React) 검증.
//
// Svelte src/routes/BuildRequest.test.ts 의 15 시나리오 + parseApiError helper
// 검증 7 케이스를 RTL + jsdom 으로 동등 검증. svelte-spa-router 의 push mock 은
// react-router-dom useNavigate mock 으로, "vi.mock('@/lib/api')" 는 path 별 mock
// 으로 대체. submitBuildRequest 시그니처는 BuildRequestPayload →
// BuildAcceptedResponse | BuildDuplicateResponse union 으로 검증.
//
// 본 파일은 Svelte test 의 다음 시나리오를 다룸:
//   - 로그인 상태에서 default hello preset 적용
//   - 4 preset 버튼 (Hello World / Minimal / TypeScript / Random)
//   - 폼 validation — 모든 required field 비워두고 submit 시 fieldErrors 노출
//   - 정상 submit → 202 accepted → build detail 이동 가능
//   - 중복 submit → 409 duplicate → 기존 build 표시
//   - zod field-level error 가 들어있는 backend response → parseApiError
//     helper 가 field-level banner 로 변환
//   - Reset 버튼이 form / lastResult / errors 모두 초기화

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { BuildRequest } from "./BuildRequest";
import { parseApiError } from "@/lib/api";

const navigateMock = vi.fn();
const submitBuildRequestMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    submitBuildRequest: (payload: unknown) => submitBuildRequestMock(payload),
    parseApiError: (err: unknown) => actual.parseApiError(err)
  };
});

beforeEach(() => {
  navigateMock.mockReset();
  submitBuildRequestMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderPage(): void {
  render(
    <MemoryRouter>
      <BuildRequest />
    </MemoryRouter>
  );
}

const acceptedResponse = (appName: string) => ({
  accepted: true,
  duplicate: false,
  build: {
    buildId: "00000000-0000-0000-0000-000000000001",
    appName,
    status: "QUEUED" as const,
    lifecycleStatus: "REQUEST_ACCEPTED" as const,
    phase: "REQUEST_ACCEPTED" as const,
    previewStatus: "NOT_REQUESTED" as const,
    previewUrl: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  }
});

const duplicateResponse = (appName: string) => ({
  accepted: false,
  duplicate: true,
  reason: "ACTIVE_BUILD_EXISTS" as const,
  build: {
    buildId: "00000000-0000-0000-0000-000000000099",
    appName,
    status: "QUEUED" as const,
    lifecycleStatus: "REQUEST_ACCEPTED" as const,
    phase: "REQUEST_ACCEPTED" as const,
    previewStatus: "NOT_REQUESTED" as const,
    previewUrl: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  }
});

describe("BuildRequest (React) — TASK-099", () => {
  it("redirects to /login when no userId is stored", async () => {
    renderPage();
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true })
    );
  });

  it("applies hello preset on mount when signed in", async () => {
    localStorage.setItem("userId", "yklee");
    renderPage();
    await waitFor(() => {
      const input = screen.getByTestId("req-appName") as HTMLInputElement;
      expect(input.value).toMatch(/^hello-/);
    });
    const requestedBy = screen.getByTestId("req-requestedBy") as HTMLInputElement;
    expect(requestedBy.value).toBe("yklee");
  });

  it("'Hello World' preset 버튼이 appName 과 필드들을 갱신", async () => {
    localStorage.setItem("userId", "yklee");
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    fireEvent.click(screen.getByTestId("req-preset-typescript"));
    expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^ts-app-/);
    fireEvent.click(screen.getByTestId("req-preset-minimal"));
    expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^minimal-/);
  });

  it("'Random appName' 버튼이 appName 만 갱신 (다른 필드는 유지)", async () => {
    localStorage.setItem("userId", "yklee");
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    const before = (screen.getByTestId("req-entrypoint") as HTMLInputElement).value;
    fireEvent.click(screen.getByTestId("req-random"));
    expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^random-/);
    expect((screen.getByTestId("req-entrypoint") as HTMLInputElement).value).toBe(before);
  });

  it("Submit 시 모든 required field 가 비어있으면 field-level banner 노출", async () => {
    localStorage.setItem("userId", "yklee");
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    fireEvent.change(screen.getByTestId("req-appName"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("req-requestedBy"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("req-objectKey"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("req-checksum"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("req-entrypoint"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("req-dockerfile"), { target: { value: "" } });
    fireEvent.submit(screen.getByTestId("req-form"));
    await waitFor(() => {
      const banner = screen.queryByTestId("req-field-errors");
      expect(banner?.textContent).toMatch(/Form validation failed/);
    });
    expect(submitBuildRequestMock).not.toHaveBeenCalled();
  });

  it("previewTtlMinutes 가 0 이하면 field-level error 노출", async () => {
    localStorage.setItem("userId", "yklee");
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    // form 의 onSubmit handler 는 fireEvent.submit(form) 으로 직접 trigger
    // (RTL fireEvent.click(submit-button) 은 form submit 을 trigger 하지 않음).
    fireEvent.change(screen.getByTestId("req-ttl"), { target: { value: "0" } });
    fireEvent.submit(screen.getByTestId("req-form"));
    await waitFor(() => {
      expect(screen.getByTestId("req-field-errors").textContent).toMatch(/previewTtlMinutes/);
    });
    expect(submitBuildRequestMock).not.toHaveBeenCalled();
  });

  it("Submit 성공 → 202 accepted → 결과 패널 + Open Build Detail 버튼 노출", async () => {
    localStorage.setItem("userId", "yklee");
    submitBuildRequestMock.mockResolvedValueOnce(acceptedResponse("hello-abc"));
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    fireEvent.submit(screen.getByTestId("req-form"));
    await waitFor(() => {
      expect(submitBuildRequestMock).toHaveBeenCalledTimes(1);
    });
    const result = screen.getByTestId("req-result");
    expect(result.textContent).toMatch(/202 Accepted/);
    expect(result.textContent).toMatch(/Build queued/);
    const openBtn = screen.getByTestId("req-open-detail");
    expect(openBtn.getAttribute("href")).toBe("/builds/00000000-0000-0000-0000-000000000001");
  });

  it("Submit → 409 duplicate → 409 배너 + Open existing Build 버튼 노출", async () => {
    localStorage.setItem("userId", "yklee");
    submitBuildRequestMock.mockResolvedValueOnce(duplicateResponse("hello-abc"));
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    fireEvent.submit(screen.getByTestId("req-form"));
    await waitFor(() => {
      expect(submitBuildRequestMock).toHaveBeenCalledTimes(1);
    });
    const result = screen.getByTestId("req-result");
    expect(result.textContent).toMatch(/409 Duplicate/);
    expect(result.textContent).toMatch(/Active build already exists/);
    expect(screen.getByTestId("req-open-existing").getAttribute("href")).toBe(
      "/builds/00000000-0000-0000-0000-000000000099"
    );
  });

  it("Submit 실패 → zod field error 가 들어있는 응답 → parseApiError 가 field banner 로 변환", async () => {
    localStorage.setItem("userId", "yklee");
    const wrappedErrorMessage = JSON.stringify({
      statusCode: 500,
      error: "Internal Server Error",
      message: JSON.stringify([
        {
          expected: "string",
          code: "invalid_type",
          path: ["appName"],
          message: "Invalid input: expected string, received undefined"
        }
      ])
    });
    submitBuildRequestMock.mockRejectedValueOnce(
      new Error(`POST /builds failed: 500 ${wrappedErrorMessage}`)
    );
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    fireEvent.submit(screen.getByTestId("req-form"));
    await waitFor(() => {
      expect(submitBuildRequestMock).toHaveBeenCalledTimes(1);
    });
    const banner = screen.getByTestId("req-field-errors");
    expect(banner.textContent).toMatch(/appName/);
    expect(banner.textContent).toMatch(/Invalid input/);
  });

  it("Submit 실패 → 일반 error (parseApiError summary) → error banner 노출", async () => {
    localStorage.setItem("userId", "yklee");
    submitBuildRequestMock.mockRejectedValueOnce(new Error("network down"));
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    fireEvent.submit(screen.getByTestId("req-form"));
    await waitFor(() => {
      expect(submitBuildRequestMock).toHaveBeenCalledTimes(1);
    });
    const banner = screen.getByTestId("req-error");
    expect(banner.textContent).toMatch(/network down/);
  });

  it("Reset form 버튼이 lastResult / errors / form 모두 초기화", async () => {
    localStorage.setItem("userId", "yklee");
    submitBuildRequestMock.mockResolvedValueOnce(acceptedResponse("hello-abc"));
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    fireEvent.submit(screen.getByTestId("req-form"));
    await waitFor(() => {
      expect(screen.getByTestId("req-result")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("req-reset"));
    expect(screen.queryByTestId("req-result")).not.toBeInTheDocument();
    expect(screen.queryByTestId("req-field-errors")).not.toBeInTheDocument();
    expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/);
  });

  it("'View Builds list' 링크가 /builds 로 navigation", async () => {
    localStorage.setItem("userId", "yklee");
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    const listLink = screen.getByTestId("req-list");
    expect(listLink.getAttribute("href")).toBe("/builds");
  });

  it("Raw payload preview 가 form 값과 동기화", async () => {
    localStorage.setItem("userId", "yklee");
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId("req-appName") as HTMLInputElement).value).toMatch(/^hello-/)
    );
    const details = screen.getByText((content) => content.startsWith("Raw payload preview"));
    const parent = details.closest("details");
    expect(parent).not.toBeNull();
    const pre = parent!.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toMatch(/"appName": "hello-/);
  });

  it("parseApiError helper 자체 — zod field error → fieldErrors + summary", () => {
    const wrappedErrorMessage = JSON.stringify({
      statusCode: 500,
      error: "Internal Server Error",
      message: JSON.stringify([
        {
          expected: "string",
          code: "invalid_type",
          path: ["appName"],
          message: "Invalid input: expected string, received undefined"
        },
        {
          expected: "string",
          code: "invalid_type",
          path: ["sourceArchive", "objectKey"],
          message: "Required"
        }
      ])
    });
    const err = new Error(`POST /builds failed: 500 ${wrappedErrorMessage}`);
    const result = parseApiError(err);
    expect(result.fieldErrors).toHaveLength(2);
    expect(result.fieldErrors[0]).toEqual({
      path: "appName",
      message: "Invalid input: expected string, received undefined"
    });
    expect(result.fieldErrors[1]).toEqual({
      path: "sourceArchive.objectKey",
      message: "Required"
    });
    expect(result.summary).toMatch(/2 field\(s\) failed/);
  });

  it("parseApiError helper 자체 — 일반 error → summary 만", () => {
    expect(parseApiError("plain").summary).toBe("plain");
    expect(parseApiError(new Error("network")).fieldErrors).toEqual([]);
    expect(parseApiError(new Error("network")).summary).toBe("network");
  });
});

// TASK-129: parseApiError 가 build-server 의 *실제* 에러 envelope 두 형태를
// 모두 field-level error 로 풀어내는지 고정한다.
//
// 배경: TASK-127 이 build-server 의 POST /builds 를 500(ZodError 누수) →
// 400 { message, issues } 로 정렬했는데, 그 시점 parseApiError 는 "message 가
// JSON 배열 문자열일 때" 만 issue 를 추출했다. 그래서 서버는 고쳐졌는데
// 프론트의 필드별 에러 표시가 조용히 사라지는 회귀가 생겼다. 기존 테스트는
// 서버 응답을 mock 하고 있었기 때문에 이 계약 변화를 잡지 못했다.
//
// 아래 두 케이스는 mock 이 아니라 *양쪽 envelope 문자열* 을 직접 넣어
// 계약을 고정한다.
describe("parseApiError envelope 계약 (TASK-129)", () => {
  const issues = [
    { path: ["requestedBy"], message: "Invalid input: expected string" },
    { path: ["sourceArchive"], message: "Invalid input: expected object" }
  ];

  it("현행 계약 400 { message, issues } 에서 field error 를 추출한다", () => {
    const envelope = JSON.stringify({
      message: "Invalid build request payload",
      issues
    });
    const parsed = parseApiError(new Error(`POST /builds failed: 400 ${envelope}`));
    expect(parsed.fieldErrors).toHaveLength(2);
    expect(parsed.fieldErrors.map((fe) => fe.path)).toEqual([
      "requestedBy",
      "sourceArchive"
    ]);
    expect(parsed.summary).toMatch(/2 field\(s\) failed/);
  });

  it("레거시 500 { message: '[...zod...]' } 도 계속 처리한다", () => {
    const envelope = JSON.stringify({
      statusCode: 500,
      error: "Internal Server Error",
      message: JSON.stringify(issues)
    });
    const parsed = parseApiError(new Error(`POST /builds failed: 500 ${envelope}`));
    expect(parsed.fieldErrors).toHaveLength(2);
    expect(parsed.summary).toMatch(/2 field\(s\) failed/);
  });

  it("issue 가 없는 일반 에러는 summary 만 채운다", () => {
    const envelope = JSON.stringify({ message: "Build not found." });
    const parsed = parseApiError(new Error(`GET /builds/x failed: 404 ${envelope}`));
    expect(parsed.fieldErrors).toHaveLength(0);
    expect(parsed.summary).toBe("Build not found.");
  });
});
