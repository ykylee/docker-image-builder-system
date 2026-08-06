import { describe, expect, it } from "vitest";

import { getApiBaseUrl } from "./api";

describe("getApiBaseUrl", () => {
  it("uses the Vite proxy in development", () => {
    expect(getApiBaseUrl()).toBe("/api");
  });
});
