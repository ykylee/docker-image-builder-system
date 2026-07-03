import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import Fastify from "fastify";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { registerBuildRoutes } from "../src/routes/build-routes.js";
import { BuildService } from "../src/services/build-service.js";

function buildApp() {
  const app = Fastify({ logger: false });
  const repo = createMemoryBuildRepository();
  const service = new BuildService(repo);
  return registerBuildRoutes(app, service).then(() => app);
}

const baseBody = {
  appName: "p-1",
  requestedBy: "yklee",
  sourceArchive: { objectKey: "k", checksumSha256: "s", sizeBytes: 1 },
  entrypointPath: "x"
};

describe("POST /builds/claim", () => {
  it("returns 200 with claimed=false / NO_BUILD_AVAILABLE on empty queue", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/builds/claim",
      payload: { runnerId: "r-1" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.claimed, false);
    assert.equal(body.reason, "NO_BUILD_AVAILABLE");
    await app.close();
  });

  it("returns 200 with claimed=true after enqueueing one build", async () => {
    const app = await buildApp();
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: baseBody
    });
    assert.equal(enq.statusCode, 202);
    const claim = await app.inject({
      method: "POST",
      url: "/builds/claim",
      payload: { runnerId: "r-1" }
    });
    assert.equal(claim.statusCode, 200);
    const body = claim.json();
    assert.equal(body.claimed, true);
    assert.equal(body.build.build.status, "CLAIMED");
    await app.close();
  });

  it("returns 400 on missing runnerId", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/builds/claim",
      payload: {}
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe("POST /builds/:buildId/phase", () => {
  it("returns 404 for unknown buildId", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/builds/00000000-0000-0000-0000-000000000000/phase",
      payload: { phase: "DOCKER_BUILD_STARTED", runnerId: "r-1" }
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("returns 400 for invalid phase value", async () => {
    const app = await buildApp();
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: baseBody
    });
    const buildId = enq.json().build.buildId;
    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/phase`,
      payload: { phase: "NOPE", runnerId: "r-1" }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for non-UUID buildId", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/builds/not-a-uuid/phase",
      payload: { phase: "DOCKER_BUILD_STARTED", runnerId: "r-1" }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 200 with status BUILDING on DOCKER_BUILD_STARTED", async () => {
    const app = await buildApp();
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: baseBody
    });
    const buildId = enq.json().build.buildId;
    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/phase`,
      payload: { phase: "DOCKER_BUILD_STARTED", runnerId: "r-1" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.build.phase, "DOCKER_BUILD_STARTED");
    assert.equal(body.build.status, "BUILDING");
    assert.equal(body.build.lifecycleStatus, "BUILDING");
    assert.equal(body.lifecycle.status, "BUILDING");
    assert.equal(body.test.status, "NOT_STARTED");
    await app.close();
  });
});

describe("POST /builds/:buildId/preview", () => {
  async function setupCompletedBuild() {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const create = await service.createBuild(baseBody);
    if (!("accepted" in create) || !create.accepted) throw new Error("setup");
    const buildId = create.build.buildId;
    await service.claimNextBuild();
    await service.reportPhase(buildId, "SOURCE_PREPARED");
    await service.reportPhase(buildId, "DOCKER_BUILD_STARTED");
    await service.reportPhase(buildId, "DOCKER_BUILD_COMPLETED");
    return { repo, service, buildId };
  }

  it("returns 202 with queued testDeployment", async () => {
    const { repo, service } = { ...(await setupCompletedBuild()) };
    const app = Fastify({ logger: false });
    await registerBuildRoutes(app, service);
    // x-not-existing is non-UUID so it fails zod and returns 400; not_found (404) is tested via unknown UUID below.
    const res = await app.inject({
      method: "POST",
      url: "/builds/x-not-existing/preview",
      payload: { internalPort: 8080, ttlMinutes: 30, runnerId: "r-1" }
    });
    assert.equal(res.statusCode, 400);
    await app.close();

    // proper call: a separate setup for a fresh completed build
    const fresh = await setupCompletedBuild();
    const app2 = Fastify({ logger: false });
    await registerBuildRoutes(app2, fresh.service);
    const res2 = await app2.inject({
      method: "POST",
      url: `/builds/${fresh.buildId}/preview`,
      payload: { internalPort: 8080, ttlMinutes: 30, runnerId: "r-1" }
    });
    assert.equal(res2.statusCode, 202);
    const body = res2.json();
    assert.equal(body.testDeployment.status, "QUEUED");
    await app2.close();
  });

  it("returns 400 on missing internalPort", async () => {
    const { service } = await setupCompletedBuild();
    const app = Fastify({ logger: false });
    await registerBuildRoutes(app, service);
    const res = await app.inject({
      method: "POST",
      url: "/builds/00000000-0000-0000-0000-000000000000/preview",
      payload: { ttlMinutes: 30, runnerId: "r-1" }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe("POST /builds/:buildId/test-deployment/ready", () => {
  it("returns 200 after queue with updated status READY", async () => {
    const { service, buildId } = await (async () => {
      const repo = createMemoryBuildRepository();
      const svc = new BuildService(repo);
      const create = await svc.createBuild(baseBody);
      if (!("accepted" in create) || !create.accepted) throw new Error("setup");
      const id = create.build.buildId;
      await svc.claimNextBuild();
      await svc.reportPhase(id, "SOURCE_PREPARED");
      await svc.reportPhase(id, "DOCKER_BUILD_STARTED");
      await svc.reportPhase(id, "DOCKER_BUILD_COMPLETED");
      await svc.queueTestDeployment(id, 8080, 30);
      return { service: svc, buildId: id };
    })();
    const app = Fastify({ logger: false });
    await registerBuildRoutes(app, service);
    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/test-deployment/ready`,
      payload: {
        previewUrl: "http://preview.local/x",
        host: "preview.local",
        hostPort: 38124,
        containerRef: "container-b-1",
        healthCheckPassed: true,
        portOpen: true,
        stabilityWindowPassed: true,
        runnerId: "r-1"
      }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.build.status, "TEST_READY");
    assert.equal(body.build.previewStatus, "READY");
    assert.equal(body.build.phase, "PREVIEW_READY");
    assert.equal(body.build.previewUrl, "http://preview.local/x");
    assert.equal(body.build.lifecycleStatus, "TEST_SUCCESS");
    assert.equal(body.lifecycle.status, "TEST_SUCCESS");
    assert.equal(body.test.status, "SUCCESS");
    assert.equal(body.test.containerRunning, true);
    assert.equal(body.test.healthCheckPassed, true);
    assert.equal(body.test.portOpen, true);
    assert.equal(body.test.stabilityWindowPassed, true);
    assert.equal(body.deploy.status, "NOT_STARTED");
    assert.equal(body.resultDelivery.status, "NOT_STARTED");
    await app.close();
  });
});

describe("POST /builds/:buildId/deployment", () => {
  it("returns 200 after ready with DEPLOY_SUCCESS canonical block", async () => {
    const { service, buildId } = await (async () => {
      const repo = createMemoryBuildRepository();
      const svc = new BuildService(repo);
      const create = await svc.createBuild(baseBody);
      if (!("accepted" in create) || !create.accepted) throw new Error("setup");
      const id = create.build.buildId;
      await svc.claimNextBuild();
      await svc.reportPhase(id, "SOURCE_PREPARED");
      await svc.reportPhase(id, "DOCKER_BUILD_STARTED");
      await svc.reportPhase(id, "DOCKER_BUILD_COMPLETED");
      await svc.queueTestDeployment(id, 8080, 30);
      await svc.reportPreviewStatus(id, "READY", {
        previewUrl: "http://preview.local/x",
        host: "preview.local",
        hostPort: 38124,
        healthCheckPassed: true,
        portOpen: true,
        stabilityWindowPassed: true
      });
      return { service: svc, buildId: id };
    })();

    const app = Fastify({ logger: false });
    await registerBuildRoutes(app, service);
    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/deployment`,
      payload: {
        status: "SUCCESS",
        targetType: "DOCKER_REGISTRY",
        targetRef: "registry.example.com/todo-app",
        resultRef: "registry.example.com/todo-app:build-1",
        runnerId: "r-1",
        responsePayloadJson: {
          deliveryMode: "POLLING"
        }
      }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.build.status, "DEPLOY_SUCCESS");
    assert.equal(body.build.phase, "DEPLOYMENT_COMPLETED");
    assert.equal(body.build.lifecycleStatus, "DEPLOY_SUCCESS");
    assert.equal(body.lifecycle.status, "DEPLOY_SUCCESS");
    assert.equal(body.deploy.status, "SUCCESS");
    assert.equal(body.deploy.targetType, "DOCKER_REGISTRY");
    assert.equal(body.deploy.resultRef, "registry.example.com/todo-app:build-1");
    assert.equal(body.resultDelivery.mode, "POLLING");
    assert.equal(body.resultDelivery.status, "IN_PROGRESS");
    await app.close();
  });
});

describe("GET /builds/:buildId/test-deployment", () => {
  it("returns 404 when no preview requested", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const create = await service.createBuild(baseBody);
    if (!("accepted" in create) || !create.accepted) throw new Error("setup");
    const app = Fastify({ logger: false });
    await registerBuildRoutes(app, service);
    const res = await app.inject({
      method: "GET",
      url: `/builds/${create.build.buildId}/test-deployment`
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("returns 200 with testDeployment after queue", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const create = await service.createBuild(baseBody);
    if (!("accepted" in create) || !create.accepted) throw new Error("setup");
    const id = create.build.buildId;
    await service.claimNextBuild();
    await service.reportPhase(id, "DOCKER_BUILD_STARTED");
    await service.reportPhase(id, "DOCKER_BUILD_COMPLETED");
    await service.queueTestDeployment(id, 8080, 30);

    const app = Fastify({ logger: false });
    await registerBuildRoutes(app, service);
    const res = await app.inject({
      method: "GET",
      url: `/builds/${id}/test-deployment`
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.testDeployment.status, "QUEUED");
    assert.equal(body.testDeployment.internalPort, 8080);
    await app.close();
  });
});
