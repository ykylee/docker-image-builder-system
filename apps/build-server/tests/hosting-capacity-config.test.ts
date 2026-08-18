import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRuntimeEnv, toRuntimeSettings } from "@docker-image-builder-system/shared-config";

describe("hosting capacity runtime configuration", () => {
  it("uses the conservative defaults", () => {
    const settings = toRuntimeSettings(parseRuntimeEnv({}));
    assert.deepEqual(settings.hostingCapacity, {
      cpuMillicores: 2000,
      memoryMi: 5632
    });
    assert.equal(settings.corsOrigin, false);
  });

  it("allows explicit CORS origin opt-in", () => {
    assert.equal(toRuntimeSettings(parseRuntimeEnv({ CORS_ORIGIN: "https://monitor.example.test" })).corsOrigin, "https://monitor.example.test");
    assert.equal(toRuntimeSettings(parseRuntimeEnv({ CORS_ORIGIN: "true" })).corsOrigin, true);
  });

  it("accepts cluster-observed allocatable capacity overrides", () => {
    const settings = toRuntimeSettings(parseRuntimeEnv({
      HOSTING_CAPACITY_CPU_MILLICORES: "3500",
      HOSTING_CAPACITY_MEMORY_MI: "8192"
    }));
    assert.deepEqual(settings.hostingCapacity, {
      cpuMillicores: 3500,
      memoryMi: 8192
    });
  });

  it("rejects non-positive capacity values", () => {
    assert.throws(() => parseRuntimeEnv({ HOSTING_CAPACITY_CPU_MILLICORES: "0" }));
  });

  it("accepts the optional drift alert webhook", () => {
    const settings = toRuntimeSettings(parseRuntimeEnv({
      HOSTING_CAPACITY_DRIFT_ALERT_WEBHOOK_URL: "https://alerts.example.test/capacity"
    }));
    assert.equal(
      settings.hostingCapacityDriftAlertWebhookUrl,
      "https://alerts.example.test/capacity"
    );
  });

  it("defaults drift webhook cooldown to fifteen minutes", () => {
    const settings = toRuntimeSettings(parseRuntimeEnv({}));
    assert.equal(settings.hostingCapacityDriftAlertCooldownMs, 900_000);
  });
});
