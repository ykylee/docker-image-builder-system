import { describe, it, expect } from "vitest";
import { parseApiError } from "./api.js";

// TASK-079 셀프 리뷰 C-2 보완: parseApiError helper 자체에 대한 unit test.
// BuildRequest UI 가 field-level error 를 표시하기 위해 의존 — helper 의
// 정확성을 BuildRequest.test.ts 외 별도 layer 에서 검증.

describe("parseApiError", () => {
  it("zod field-level error 가 들어있는 backend response 를 파싱하여 fieldErrors 반환", () => {
    // backend 가 throw 한 raw error message — openapi-fetch 가 다음과 같이
    // wrapping 함:
    //   "POST /builds failed: 500 {...full JSON envelope...}"
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
    // field-level error 추출.
    expect(result.fieldErrors).toHaveLength(2);
    expect(result.fieldErrors[0]).toEqual({
      path: "appName",
      message: "Invalid input: expected string, received undefined"
    });
    // nested path 가 dot 으로 join.
    expect(result.fieldErrors[1]).toEqual({
      path: "sourceArchive.objectKey",
      message: "Required"
    });
    // summary 는 한 줄 요약.
    expect(result.summary).toMatch(/2 field\(s\) failed/);
    expect(result.summary).toMatch(/appName/);
    expect(result.summary).toMatch(/sourceArchive\.objectKey/);
  });

  it("fieldErrors 가 없을 때 (일반 error) summary 만 노출", () => {
    const err = new Error("network down");
    const result = parseApiError(err);
    expect(result.fieldErrors).toEqual([]);
    expect(result.summary).toBe("network down");
  });

  it("JSON parse 실패한 malformed error message 처리", () => {
    const err = new Error("POST /builds failed: 500 {not valid json}");
    const result = parseApiError(err);
    // lastIndexOf 로 { } 가 매칭되어 부분 추출 → parse 실패 → raw 그대로.
    expect(result.fieldErrors).toEqual([]);
    expect(result.summary).toBe("POST /builds failed: 500 {not valid json}");
  });

  it("Error 가 아닌 unknown 입력도 처리", () => {
    const result = parseApiError("plain string error");
    expect(result.summary).toBe("plain string error");
    expect(result.fieldErrors).toEqual([]);
  });

  it("backend envelope 의 message 가 stringified JSON array 가 아닌 경우", () => {
    const wrappedErrorMessage = JSON.stringify({
      statusCode: 404,
      error: "Not Found",
      message: "Build not found: <buildId>"
    });
    const err = new Error(`POST /builds failed: 404 ${wrappedErrorMessage}`);
    const result = parseApiError(err);
    // message 가 plain string — field-level error 아님, summary 에 그대로.
    expect(result.fieldErrors).toEqual([]);
    expect(result.summary).toBe("Build not found: <buildId>");
  });

  it("backend envelope 에 statusCode / error 만 있고 message 없음", () => {
    const wrappedErrorMessage = JSON.stringify({
      statusCode: 503,
      error: "Service Unavailable"
    });
    const err = new Error(`POST /builds failed: 503 ${wrappedErrorMessage}`);
    const result = parseApiError(err);
    expect(result.fieldErrors).toEqual([]);
    expect(result.summary).toMatch(/503/);
    expect(result.summary).toMatch(/Service Unavailable/);
  });

  it("nested path 가 3 단계 이상이어도 모두 join", () => {
    const wrappedErrorMessage = JSON.stringify({
      statusCode: 500,
      error: "Internal Server Error",
      message: JSON.stringify([
        {
          expected: "number",
          code: "invalid_type",
          path: ["outer", "middle", "inner"],
          message: "expected number"
        }
      ])
    });
    const err = new Error(`POST /builds failed: 500 ${wrappedErrorMessage}`);
    const result = parseApiError(err);
    expect(result.fieldErrors).toHaveLength(1);
    expect(result.fieldErrors[0].path).toBe("outer.middle.inner");
  });
});