import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";

const baseRequest = {
  projectId: "p-1",
  repositoryId: "r-1",
  requestedBy: "yklee",
  sourceArchive: {
    objectKey: "src/p-1/r-1/abc.tar.gz",
    checksumSha256: "deadbeef",
    sizeBytes: 1024
  },
  entrypointPath: "src/index.ts"
};

describe("MemoryBuildRepository: claimNextBuild", () => {
  it("returns no_build_available when queue is empty", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "no_build_available");
  });

  it("claims oldest QUEUED build and transitions to CLAIMED + QUEUE_CLAIMED", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(baseRequest);
    assert.equal(create.kind, "accepted");

    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.response.build.status, "CLAIMED");
    assert.equal(result.response.build.phase, "QUEUE_CLAIMED");
  });

  it("returns active_build_exists when a CLAIMED build is present", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild(baseRequest);
    const first = await repo.claimNextBuild();
    assert.equal(first.kind, "claimed");

    // enqueue a 2nd build for a different repoId so it isn't blocked by duplicate guard
    await repo.createBuild({ ...baseRequest, repositoryId: "r-2" });
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "active_build_exists");
    if (result.kind !== "active_build_exists") return;
    assert.equal(result.build.build.status, "CLAIMED");
  });

  it("appends QUEUE_CLAIMED log entry on claim", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild(baseRequest);
    const first = await repo.claimNextBuild();
    if (first.kind !== "claimed") return;
    const logs = await repo.getBuildLogs(first.response.build.buildId);
    assert.ok(logs);
    const claimLog = logs!.find((l) => l.phase === "QUEUE_CLAIMED");
    assert.ok(claimLog, "QUEUE_CLAIMED log entry should exist");
    assert.equal(claimLog!.message, "Build claimed by runner.");
  });

  it("picks oldest QUEUED when previous build is COMPLETED", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild(baseRequest);
    const first = await repo.claimNextBuild();
    if (first.kind !== "claimed") return;
    const buildId = first.response.build.buildId;
    await repo.updatePhase(buildId, "DOCKER_BUILD_STARTED");
    await repo.updatePhase(buildId, "COMPLETED");
    await repo.createBuild({ ...baseRequest, repositoryId: "r-2" });
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.response.build.repositoryId, "r-2");
  });
});

describe("MemoryBuildRepository: updatePhase", () => {
  async function setupQueuedBuild() {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(baseRequest);
    if (create.kind !== "accepted") throw new Error("setup failed");
    return { repo, buildId: create.response.build.buildId };
  }

  it("returns not_found for unknown buildId", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.updatePhase("00000000-0000-0000-0000-000000000000", "DOCKER_BUILD_STARTED");
    assert.equal(result.kind, "not_found");
  });

  it("transitions status to BUILDING when phase is DOCKER_BUILD_STARTED", async () => {
    const { repo, buildId } = await setupQueuedBuild();
    const result = await repo.updatePhase(buildId, "DOCKER_BUILD_STARTED");
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "DOCKER_BUILD_STARTED");
    assert.equal(result.response.build.status, "BUILDING");
  });

  it("transitions status to COMPLETED when phase is COMPLETED", async () => {
    const { repo, buildId } = await setupQueuedBuild();
    const result = await repo.updatePhase(buildId, "COMPLETED");
    if (result.kind !== "ok") throw new Error("expected ok");
    assert.equal(result.response.build.status, "COMPLETED");
  });

  it("transitions status to FAILED when phase is FAILED", async () => {
    const { repo, buildId } = await setupQueuedBuild();
    const result = await repo.updatePhase(buildId, "FAILED");
    if (result.kind !== "ok") throw new Error("expected ok");
    assert.equal(result.response.build.status, "FAILED");
  });

  it("is idempotent when phase is unchanged", async () => {
    const { repo, buildId } = await setupQueuedBuild();
    const first = await repo.updatePhase(buildId, "SOURCE_PREPARED");
    const second = await repo.updatePhase(buildId, "SOURCE_PREPARED");
    assert.equal(first.kind, "ok");
    assert.equal(second.kind, "ok");
  });

  it("appends log entry with phase on every update", async () => {
    const { repo, buildId } = await setupQueuedBuild();
    await repo.updatePhase(buildId, "SOURCE_PREPARED");
    const logs = await repo.getBuildLogs(buildId);
    assert.ok(logs);
    const phaseLog = logs!.find((l) => l.phase === "SOURCE_PREPARED");
    assert.ok(phaseLog);
  });
});
