import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildListQuerySchema,
  buildStatusResponseSchema
} from "@docker-image-builder-system/shared-contract";

describe("shared-contract response migration shims (TASK-052)", () => {
  it("parses legacy preview-era build status responses", () => {
    const parsed = buildStatusResponseSchema.parse({
      build: {
        buildId: "11111111-1111-4111-8111-111111111111",
        appName: "todo-app",
        status: "TEST_SUCCESS",
        phase: "CONTAINER_TEST_PASSED",
        runtimeUrl: "http://127.0.0.1:38124/",
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:05:00.000Z"
      },
      lastError: null,
      phaseHistory: [
        { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T00:00:30.000Z" }
      ],
      currentPhase: {
        phase: "CONTAINER_TEST_PASSED",
        startedAt: "2026-07-03T00:05:00.000Z"
      }
    });

    assert.equal(parsed.build.status, "TEST_SUCCESS");
    assert.equal(parsed.lifecycle, undefined);
    assert.equal(parsed.test, undefined);
  });

  it("parses canonical lifecycle/test/deploy/result-delivery blocks", () => {
    const parsed = buildStatusResponseSchema.parse({
      build: {
        buildId: "22222222-2222-4222-8222-222222222222",
        appName: "todo-app",
        status: "DEPLOY_SUCCESS",
        lifecycleStatus: "DEPLOY_SUCCESS",
        phase: "COMPLETED",
        runtimeUrl: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:10:00.000Z"
      },
      lastError: null,
      phaseHistory: [
        { phase: "REQUEST_ACCEPTED", completedAt: "2026-07-03T00:00:10.000Z" },
        { phase: "SOURCE_PREPARED", completedAt: "2026-07-03T00:02:00.000Z" },
        { phase: "DOCKER_BUILD_COMPLETED", completedAt: "2026-07-03T00:05:00.000Z" },
        { phase: "COMPLETED", completedAt: "2026-07-03T00:10:00.000Z" }
      ],
      currentPhase: null,
      lifecycle: {
        status: "DEPLOY_SUCCESS",
        startedAt: "2026-07-03T00:00:00.000Z",
        finishedAt: "2026-07-03T00:10:00.000Z"
      },
      image: {
        name: "registry.example.com/todo-app",
        tag: "bld-1",
        digest: null
      },
      test: {
        status: "SUCCESS",
        containerRunning: true,
        healthCheckPassed: true,
        portOpen: true,
        stabilityWindowPassed: true
      },
      deploy: {
        status: "SUCCESS",
        targetType: "DOCKER_REGISTRY",
        resultRef: "push-1"
      },
      resultDelivery: {
        status: "NOT_STARTED",
        mode: "POLLING",
        deliveredAt: null
      }
    });

    assert.equal(parsed.lifecycle?.status, "DEPLOY_SUCCESS");
    assert.equal(parsed.test?.status, "SUCCESS");
    assert.equal(parsed.deploy?.targetType, "DOCKER_REGISTRY");
    assert.equal(parsed.resultDelivery?.mode, "POLLING");
  });

  it("accepts canonical lifecycle statuses in build list queries", () => {
    const parsed = buildListQuerySchema.parse({
      status: "DEPLOYING",
      limit: 25
    });

    assert.equal(parsed.status, "DEPLOYING");
    assert.equal(parsed.limit, 25);
  });
});
