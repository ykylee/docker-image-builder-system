import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { BuildService } from "../src/services/build-service.js";

const baseRequest = {
  projectId: "p-1",
  repositoryId: "r-1",
  requestedBy: "yklee",
  sourceArchive: { objectKey: "k", checksumSha256: "s", sizeBytes: 1 },
  entrypointPath: "x"
};

describe("BuildService: claimNextBuild", () => {
  it("returns NO_BUILD_AVAILABLE on empty queue", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const result = await service.claimNextBuild();
    assert.equal(result.claimed, false);
    assert.equal(result.build, null);
    assert.equal(result.reason, "NO_BUILD_AVAILABLE");
  });

  it("returns claimed=true on first claim", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    await service.createBuild(baseRequest);
    const result = await service.claimNextBuild();
    assert.equal(result.claimed, true);
    assert.equal(result.reason, null);
    assert.equal(result.build?.build.status, "CLAIMED");
    assert.equal(result.build?.build.phase, "QUEUE_CLAIMED");
  });

  it("returns ACTIVE_BUILD_EXISTS when a build is already in flight", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    await service.createBuild(baseRequest);
    const first = await service.claimNextBuild();
    assert.equal(first.claimed, true);
    await service.createBuild({ ...baseRequest, repositoryId: "r-2" });
    const second = await service.claimNextBuild();
    assert.equal(second.claimed, false);
    assert.equal(second.reason, "ACTIVE_BUILD_EXISTS");
    assert.equal(second.build?.build.status, "CLAIMED");
  });
});

describe("BuildService: reportPhase", () => {
  it("returns not_found for unknown buildId", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const result = await service.reportPhase(
      "00000000-0000-0000-0000-000000000000",
      "DOCKER_BUILD_STARTED"
    );
    assert.equal(result.kind, "not_found");
  });

  it("returns ok with updated build on valid phase", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const create = await service.createBuild(baseRequest);
    if (!("accepted" in create) || !create.accepted) throw new Error("setup");
    const result = await service.reportPhase(create.build.buildId, "DOCKER_BUILD_STARTED");
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "DOCKER_BUILD_STARTED");
    assert.equal(result.response.build.status, "BUILDING");
  });
});
