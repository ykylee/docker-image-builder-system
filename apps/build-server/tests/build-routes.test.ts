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
  projectId: "p-1",
  repositoryId: "r-1",
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
    await app.close();
  });
});
