import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BuildRequest } from "@docker-image-builder-system/shared-contract";

import { resolveHostingPolicy } from "../src/services/hosting-policy.js";

function request(overrides: Partial<BuildRequest> = {}): BuildRequest {
  return {
    appName: "tier-test",
    requestedBy: "alice",
    sourceArchive: {
      objectKey: "ref://tier-test",
      checksumSha256: "0".repeat(64),
      sizeBytes: 1
    },
    entrypointPath: "index.js",
    dockerfilePath: "Dockerfile",
    metadata: {},
    ...overrides
  };
}

describe("hosting policy resolver", () => {
  it("defaults an unspecified request to sandbox resources", () => {
    const result = resolveHostingPolicy(request());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.policy.effectiveTier, "sandbox");
      assert.deepEqual(result.policy.resources, {
        cpuRequest: "100m",
        memoryRequest: "128Mi",
        cpuLimit: "500m",
        memoryLimit: "512Mi",
        replicas: 1
      });
    }
  });

  it("promotes by service size and resource request", () => {
    const result = resolveHostingPolicy(
      request({
        serviceSize: "medium",
        resources: { memoryRequest: "768Mi", replicas: 2 }
      })
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.policy.effectiveTier, "standard");
  });

  it("rejects a lower requested tier that cannot contain the request", () => {
    const result = resolveHostingPolicy(
      request({
        requestedTier: "sandbox",
        resources: { memoryRequest: "512Mi" }
      })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "tier_upgrade_required");
  });

  it("rejects values over the production ceiling", () => {
    const result = resolveHostingPolicy(
      request({ resources: { cpuRequest: "3", replicas: 5 } })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "resource_limit_exceeded");
  });
});
