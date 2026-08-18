import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app/create-app.js";
import { parseRuntimeEnv, toRuntimeSettings } from "@docker-image-builder-system/shared-config";

test("health and readiness probes expose distinct stable responses", async () => {
  const app = await createApp(toRuntimeSettings(parseRuntimeEnv({
    BUILD_REPOSITORY_BACKEND: "memory",
    CORS_ORIGIN: "false"
  })));
  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.deepEqual(health.json(), { status: "ok" });
    const ready = await app.inject({ method: "GET", url: "/ready" });
    assert.deepEqual(ready.json(), { status: "ready" });
  } finally {
    await app.close();
  }
});
