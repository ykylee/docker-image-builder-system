import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateAllTierCapacity, calculateTierCapacity, resourceCost } from "../src/services/hosting-capacity.js";
import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { BuildService } from "../src/services/build-service.js";

describe("hosting capacity calculator", () => {
  it("uses aggregate replica resource cost", () => {
    assert.deepEqual(resourceCost({
      cpuRequest: "250m", memoryRequest: "512Mi", cpuLimit: "1", memoryLimit: "1Gi", replicas: 2
    }), { cpuMillicores: 500, memoryMi: 1024 });
  });

  it("uses the more constrained CPU or memory axis", () => {
    const result = calculateTierCapacity("standard", { cpuMillicores: 2000, memoryMi: 5632 });
    assert.equal(result.cpuServices, 8);
    assert.equal(result.memoryServices, 11);
    assert.equal(result.maxServices, 8);
  });

  it("matches the v1 local baseline", () => {
    const result = calculateAllTierCapacity();
    assert.equal(result.sandbox.maxServices, 20);
    assert.equal(result.standard.maxServices, 8);
    assert.equal(result.production.maxServices, 2);
  });

  function buildInput(appName: string, requestedTier: "standard" | "production" = "standard") {
    return {
      appName,
      requestedBy: "capacity-test",
      requestedTier,
      sourceArchive: {
        objectKey: `${appName}.tar.gz`,
        checksumSha256: "a".repeat(64),
        sizeBytes: 1
      },
      entrypointPath: "index.js",
      dockerfilePath: "Dockerfile",
      metadata: {}
    } as const;
  }

  it("memory admission rejects the request that exceeds aggregate capacity", async () => {
    const repository = createMemoryBuildRepository();

    for (let i = 0; i < 8; i += 1) {
      assert.equal((await repository.createBuild(buildInput(`standard-${i}`))).kind, "accepted");
    }

    const rejected = await repository.createBuild(buildInput("standard-over-capacity"));

    assert.deepEqual(rejected, {
      kind: "hosting_capacity_exceeded",
      tier: "standard"
    });
  });

  it("memory admission releases a failed build reservation", async () => {
    const repository = createMemoryBuildRepository();
    const created = await repository.createBuild(buildInput("release-me", "production"));
    assert.equal(created.kind, "accepted");
    if (created.kind !== "accepted") return;

    assert.equal(await repository.releaseHostingCapacity(created.response.build.buildId), true);
    const replacement = await repository.createBuild(buildInput("replacement", "production"));

    assert.equal(replacement.kind, "accepted");
  });

  it("build service surfaces capacity exhaustion before accepting the request", async () => {
    const repository = createMemoryBuildRepository();
    const service = new BuildService(repository);
    for (let i = 0; i < 8; i += 1) {
      assert.equal((await service.createBuild(buildInput(`service-${i}`))).kind, "accepted");
    }

    assert.deepEqual(await service.createBuild(buildInput("service-over-capacity")), {
      kind: "hosting_capacity_exceeded",
      tier: "standard"
    });
  });
});
