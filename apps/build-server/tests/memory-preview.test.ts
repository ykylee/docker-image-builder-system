import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";

const baseRequest = {
  appName: "p-1",
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

describe("MemoryBuildRepository: startContainerTest", () => {
  it("returns not_found for unknown buildId", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.startContainerTest(
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
    const result = await repo.startContainerTest(create.response.build.buildId, 8080, 60);
    assert.equal(result.kind, "invalid_state");
  });

  it("starts container test at DOCKER_BUILD_COMPLETED and transitions to CONTAINER_TEST_STARTED", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    const result = await repo.startContainerTest(buildId, 8080, 30);
    assert.equal(result.kind, "queued");
    if (result.kind !== "queued") return;
    assert.equal(result.response.build.phase, "CONTAINER_TEST_STARTED");
    assert.equal(result.testDeployment.status, "IN_PROGRESS");
    assert.equal(result.testDeployment.internalPort, 8080);
    assert.ok(result.testDeployment.expiresAt);
  });
});

describe("MemoryBuildRepository: reportContainerTestResult", () => {
  it("returns not_found for unknown buildId", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.reportContainerTestResult("00000000-0000-0000-0000-000000000000", "SUCCESS");
    assert.equal(result.kind, "not_found");
  });

  it("SUCCESS transitions to CONTAINER_TEST_PASSED / TEST_SUCCESS", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    await repo.startContainerTest(buildId, 8080, 30);
    const result = await repo.reportContainerTestResult(buildId, "SUCCESS", {
      runtimeUrl: "http://preview.local/x",
      host: "preview.local",
      hostPort: 38124,
      containerRef: "container-x",
      healthCheckPassed: true,
      portOpen: true,
      stabilityWindowPassed: true
    });
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "CONTAINER_TEST_PASSED");
    assert.equal(result.response.build.status, "TEST_SUCCESS");
    assert.equal(result.testDeployment.runtimeUrl, "http://preview.local/x");
    assert.equal(result.response.test.status, "SUCCESS");
    assert.equal(result.response.test.healthCheckPassed, true);
    assert.equal(result.response.test.portOpen, true);
    assert.equal(result.response.test.stabilityWindowPassed, true);
  });

  it("FAILED transitions to FAILED", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    await repo.startContainerTest(buildId, 8080, 30);
    const result = await repo.reportContainerTestResult(buildId, "FAILED");
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "FAILED");
    assert.equal(result.response.build.status, "FAILED");
  });
});

// TASK-161 (P2-M2 Sub-commit B): `getTestDeployment` 메서드 제거 (consumer 0).
// 본 describe 블록 전체 제거 — canonical `build_test`(ContainerTestResult) 가
// 같은 정보를 담는다.

describe("MemoryBuildRepository: reportDeploymentResult", () => {
  it("SUCCESS transitions to DEPLOYMENT_COMPLETED / DEPLOY_SUCCESS", async () => {
    const { repo, buildId } = await setupBuildAtCompletedPhase();
    await repo.startContainerTest(buildId, 8080, 30);
    await repo.reportContainerTestResult(buildId, "SUCCESS", {
      runtimeUrl: "http://preview.local/x",
      host: "preview.local",
      hostPort: 38124,
      healthCheckPassed: true,
      portOpen: true,
      stabilityWindowPassed: true
    });

    const result = await repo.reportDeploymentResult(buildId, {
      status: "SUCCESS",
      targetType: "DOCKER_REGISTRY",
      targetRef: "registry.example.com/todo-app",
      resultRef: "registry.example.com/todo-app:build-1",
      runnerId: "r-1",
      responsePayloadJson: {
        deliveryMode: "POLLING"
      }
    });
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "DEPLOYMENT_COMPLETED");
    assert.equal(result.response.build.status, "DEPLOY_SUCCESS");
    assert.equal(result.response.deploy.status, "SUCCESS");
    assert.equal(result.response.deploy.targetType, "DOCKER_REGISTRY");
    assert.equal(result.response.deploy.resultRef, "registry.example.com/todo-app:build-1");
    assert.equal(result.response.resultDelivery.mode, "POLLING");
  });
});
