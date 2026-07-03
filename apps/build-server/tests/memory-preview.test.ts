import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";

const baseRequest = {
  projectId: "p-1",
  repositoryId: "r-1",
  requestedBy: "yklee",
  sourceArchive: { objectKey: "k", checksumSha256: "s", sizeBytes: 1 },
  entrypointPath: "x"
};

async function setupBuildAtCompletedPhase() {
  const repo = createMemoryBuildRepository();
  const create = await repo.createBuild(baseRequest);
  if (create.kind !== "accepted") throw new Error("setup");
  const buildId = create.response.build.buildId;
  await repo.claimNextBuild();
  await repo.updatePhase(buildId, "SOURCE_PREPARED");
  await repo.updatePhase(buildId, "DOCKER_BUILD_STARTED");
  await repo.updatePhase(buildId, "DOCKER_BUILD_COMPLETED");
  return { repo, buildId };
}

describe("MemoryBuildRepository: queueTestDeployment", () => {
  it("returns not_found for unknown buildId", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.queueTestDeployment(
      "00000000-0000-0000-0000-000000000000",
      8080,
      60
    );
    assert.equal(result.kind, "not_found");
  });

  it("returns invalid_state when build is QUEUED", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(baseRequest);
    if (create.kind !== "accepted") throw new Error("setup");
    const result = await repo.queueTestDeployment(create.response.build.buildId, 8080, 60);
    assert.equal(result.kind, "invalid_state");
  });

  it("queues preview at DOCKER_BUILD_COMPLETED and transitions to PREVIEW_QUEUED", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    const result = await repo.queueTestDeployment(buildId, 8080, 30);
    assert.equal(result.kind, "queued");
    if (result.kind !== "queued") return;
    assert.equal(result.response.build.phase, "PREVIEW_QUEUED");
    assert.equal(result.response.build.previewStatus, "QUEUED");
    assert.equal(result.testDeployment.status, "QUEUED");
    assert.equal(result.testDeployment.internalPort, 8080);
    assert.ok(result.testDeployment.expiresAt);
  });
});

describe("MemoryBuildRepository: reportPreviewStatus", () => {
  it("returns not_found for unknown buildId", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.reportPreviewStatus("00000000-0000-0000-0000-000000000000", "READY");
    assert.equal(result.kind, "not_found");
  });

  it("READY transitions to PREVIEW_READY / TEST_READY", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    await repo.queueTestDeployment(buildId, 8080, 30);
    const result = await repo.reportPreviewStatus(buildId, "READY", {
      previewUrl: "http://preview.local/x",
      host: "preview.local",
      hostPort: 38124
    });
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "PREVIEW_READY");
    assert.equal(result.response.build.status, "TEST_READY");
    assert.equal(result.testDeployment.previewUrl, "http://preview.local/x");
  });

  it("FAILED transitions to FAILED", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    await repo.queueTestDeployment(buildId, 8080, 30);
    const result = await repo.reportPreviewStatus(buildId, "FAILED");
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "FAILED");
    assert.equal(result.response.build.status, "FAILED");
  });
});

describe("MemoryBuildRepository: getTestDeployment", () => {
  it("returns not_requested when no preview has been queued", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(baseRequest);
    if (create.kind !== "accepted") throw new Error("setup");
    const result = await repo.getTestDeployment(create.response.build.buildId);
    assert.equal(result.kind, "not_requested");
  });

  it("returns not_found for unknown buildId", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.getTestDeployment("00000000-0000-0000-0000-000000000000");
    assert.equal(result.kind, "not_found");
  });

  it("returns found with full testDeployment after queue + ready", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    await repo.queueTestDeployment(buildId, 8080, 30);
    await repo.reportPreviewStatus(buildId, "READY", { previewUrl: "http://x/y", host: "x", hostPort: 1 });
    const result = await repo.getTestDeployment(buildId);
    assert.equal(result.kind, "found");
    if (result.kind !== "found") return;
    assert.equal(result.testDeployment.status, "READY");
    assert.equal(result.testDeployment.previewUrl, "http://x/y");
  });
});
