import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";

import {
  assessHostingCapacityDrift,
  capacityFromNodeList,
  postHostingCapacityDriftAlert,
  shouldSendDriftAlert,
  startHostingCapacityMonitor
} from "../src/services/hosting-capacity-monitor.js";

describe("hosting capacity drift monitor", () => {
  it("accepts observed capacity within the configured threshold", () => {
    const result = assessHostingCapacityDrift(
      { cpuMillicores: 2000, memoryMi: 5632 },
      { cpuMillicores: 1900, memoryMi: 5400 },
      0.1
    );
    assert.equal(result.status, "ok");
    assert.equal(result.cpuRatio, 0.95);
  });

  it("flags a capacity drop on either resource axis", () => {
    const result = assessHostingCapacityDrift(
      { cpuMillicores: 2000, memoryMi: 5632 },
      { cpuMillicores: 1200, memoryMi: 5400 },
      0.1
    );
    assert.equal(result.status, "drift");
    assert.equal(result.reason, "CPU capacity is below the configured threshold.");
  });

  it("converts node allocatable quantities and applies reserve", () => {
    const result = capacityFromNodeList([
      { status: { allocatable: { cpu: "4", memory: "8113108Ki" } } },
      { status: { allocatable: { cpu: "500m", memory: "1Gi" } } }
    ], 0.25);
    assert.deepEqual(result, { cpuMillicores: 3375, memoryMi: 6710 });
  });

  it("emits a drift event when an explicit check detects a drop", async () => {
    const events: string[] = [];
    const monitor = startHostingCapacityMonitor({
      configured: { cpuMillicores: 2000, memoryMi: 5632 },
      reserveRatio: 0.25,
      threshold: 0.1,
      intervalMs: 0,
      observe: async () => ({ cpuMillicores: 1000, memoryMi: 5632 }),
      onDrift: (drift) => events.push(drift.reason ?? "unknown"),
      onError: (error) => { throw error; }
    });
    await monitor.check();
    monitor.stop();
    assert.deepEqual(events, ["CPU capacity is below the configured threshold."]);
  });

  it("posts a structured drift alert to the configured webhook", async () => {
    let received: { type: string; observed: { cpuMillicores: number } } | null = null;
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        received = JSON.parse(body) as typeof received;
        response.statusCode = 204;
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    await postHostingCapacityDriftAlert(
      `http://127.0.0.1:${address.port}/alerts`,
      {
        status: "drift",
        cpuRatio: 0.5,
        memoryRatio: 1,
        reason: "CPU capacity is below the configured threshold."
      },
      { cpuMillicores: 2000, memoryMi: 5632 },
      { cpuMillicores: 1000, memoryMi: 5632 }
    );
    await new Promise<void>((resolve) => server.close(() => resolve()));

    assert.equal(received?.type, "hosting_capacity_drift");
    assert.deepEqual(received?.observed, { cpuMillicores: 1000, memoryMi: 5632 });
  });

  it("suppresses the same reason during cooldown but allows a changed reason", () => {
    assert.equal(shouldSendDriftAlert(10_000, 5_000, 10_000, "cpu", "cpu"), false);
    assert.equal(shouldSendDriftAlert(15_000, 5_000, 10_000, "cpu", "cpu"), true);
    assert.equal(shouldSendDriftAlert(6_000, 5_000, 10_000, "cpu", "memory"), true);
  });
});
