import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import Fastify from "fastify";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { registerBuildRoutes } from "../src/routes/build-routes.js";
import { BuildService } from "../src/services/build-service.js";

function buildApp() {
  const app = Fastify({ logger: false });
  // Mirror `createApp`'s TASK-066 content-type parser so the
  // route-layer `Buffer.isBuffer(request.body)` check passes inside
  // the test fixture.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, payload, done) => done(null, payload)
  );
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

// TASK-080: claimNextBuild now requires the source archive bytes to
// have been uploaded before a QUEUED build is eligible. The
// `seedBuildWithSource` helper threads a real (dummy) archive
// through the service so existing claimNextBuild call sites can
// stay one-liner. `seedRouteBuildWithSource` is the equivalent for
// the route-level "POST /builds/claim" scenarios that go through
// the HTTP layer.
async function seedBuildWithSource(
  service: BuildService,
  base: { appName: string; requestedBy: string; entrypointPath?: string }
): Promise<{ buildId: string }> {
  const bytes = new Uint8Array(randomBytes(64));
  const checksumSha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const sizeBytes = bytes.byteLength;
  const create = await service.createBuild({
    appName: base.appName,
    requestedBy: base.requestedBy,
    sourceArchive: {
      objectKey: `src/${base.appName}/archive.tar.gz`,
      checksumSha256,
      sizeBytes
    },
    entrypointPath: base.entrypointPath ?? baseBody.entrypointPath
  });
  if (!("accepted" in create) || !create.accepted) {
    throw new Error(
      `seedBuildWithSource: expected accepted, got ${JSON.stringify(create)}`
    );
  }
  const buildId = create.build.buildId;
  const upload = await service.storeSourceArchive(
    buildId,
    bytes,
    checksumSha256,
    sizeBytes
  );
  if (upload.kind !== "ok") {
    throw new Error(`source upload failed: ${upload.kind}`);
  }
  return { buildId };
}

async function seedRouteBuildWithSource(
  app: Awaited<ReturnType<typeof buildApp>>,
  base: { appName: string; requestedBy: string; entrypointPath?: string }
): Promise<string> {
  const bytes = Buffer.from(randomBytes(64));
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const sizeBytes = bytes.byteLength;
  const enq = await app.inject({
    method: "POST",
    url: "/builds",
    payload: {
      appName: base.appName,
      requestedBy: base.requestedBy,
      sourceArchive: {
        objectKey: `src/${base.appName}/archive.tar.gz`,
        checksumSha256,
        sizeBytes
      },
      entrypointPath: base.entrypointPath ?? baseBody.entrypointPath
    }
  });
  if (enq.statusCode !== 202) {
    throw new Error(`seedRouteBuildWithSource: enq status ${enq.statusCode}`);
  }
  const buildId = (enq.json() as { build: { buildId: string } }).build.buildId;
  const upload = await app.inject({
    method: "POST",
    url: `/builds/${buildId}/source`,
    headers: { "content-type": "application/octet-stream" },
    payload: bytes
  });
  if (upload.statusCode !== 201) {
    throw new Error(`source upload status ${upload.statusCode}: ${upload.body}`);
  }
  return buildId;
}

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
    // TASK-080: claimNextBuild now requires the source archive
    // bytes. The helper drives POST /builds + POST /builds/:id/source
    // so the subsequent claim is eligible.
    await seedRouteBuildWithSource(app, {
      appName: baseBody.appName,
      requestedBy: baseBody.requestedBy,
      entrypointPath: baseBody.entrypointPath
    });
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
    const { buildId } = await seedBuildWithSource(service, {
      appName: baseBody.appName,
      requestedBy: baseBody.requestedBy
    });
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
      const { buildId: id } = await seedBuildWithSource(svc, {
        appName: baseBody.appName,
        requestedBy: baseBody.requestedBy
      });
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
      const { buildId: id } = await seedBuildWithSource(svc, {
        appName: baseBody.appName,
        requestedBy: baseBody.requestedBy
      });
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
    const { buildId: id } = await seedBuildWithSource(service, {
      appName: baseBody.appName,
      requestedBy: baseBody.requestedBy
    });
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

describe("POST /builds/:buildId/source (TASK-066)", () => {
  // 6 hex chars is enough to disambiguate unique content in this
  // test fixture; the BuildRequest schema only requires
  // checksumSha256.min(1) so a short hex string is accepted.
  async function makeBuildWithArchive(
    app: Awaited<ReturnType<typeof buildApp>>,
    archiveBytes: Buffer
  ) {
    const checksum = createHash("sha256")
      .update(archiveBytes)
      .digest("hex");
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: {
        appName: `p-source-${Math.random().toString(36).slice(2, 8)}`,
        requestedBy: "yklee",
        sourceArchive: {
          objectKey: `key-${checksum.slice(0, 8)}`,
          checksumSha256: checksum,
          sizeBytes: archiveBytes.byteLength
        },
        entrypointPath: "x"
      }
    });
    assert.equal(enq.statusCode, 202, "build should be accepted");
    return {
      buildId: (enq.json() as { build: { buildId: string } }).build.buildId,
      checksum
    };
  }

  it("returns 201 with the recomputed checksum and size for a matching upload", async () => {
    const app = await buildApp();
    const archive = Buffer.from("hello-source-archive");
    const { buildId, checksum } = await makeBuildWithArchive(app, archive);

    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: archive
    });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.buildId, buildId);
    assert.equal(body.checksumSha256, checksum);
    assert.equal(body.sizeBytes, archive.byteLength);
    await app.close();
  });

  it("returns 400 when the body checksum does not match the declared metadata", async () => {
    const app = await buildApp();
    const declared = Buffer.from("the-declared-bytes");
    const { buildId } = await makeBuildWithArchive(app, declared);

    // Upload different bytes; declared metadata still claims the
    // checksum of `declared`, so the server should refuse with 400.
    const tampered = Buffer.from("the-actual-tampered-bytes");
    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: tampered
    });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.match(body.message, /checksum/i);
    assert.equal(body.expected, createHash("sha256").update(declared).digest("hex"));
    assert.equal(body.actual, createHash("sha256").update(tampered).digest("hex"));
    await app.close();
  });

  it("returns 400 when the body size does not match the declared metadata", async () => {
    const app = await buildApp();
    // Build a body whose SHA-256 matches the declared checksum but
    // whose length differs. The route checks checksum first, so a
    // body that fails *both* would surface as checksum_mismatch.
    // To isolate size_mismatch we pick content whose sha256
    // happens to equal the declared value — that requires the
    // declared bytes and uploaded bytes to be preimages of each
    // other under SHA-256, which is computationally infeasible
    // to construct adversarially. Instead, declare the checksum
    // of the *uploaded* body and set sizeBytes one off:
    //   declared: sha256("abc"), sizeBytes=2
    //   upload:   "abc" (3 bytes) → checksum matches, size differs.
    const declared = "abc"; // 3 bytes
    const declaredChecksum = createHash("sha256").update(declared).digest("hex");
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: {
        appName: `p-size-${Math.random().toString(36).slice(2, 8)}`,
        requestedBy: "yklee",
        sourceArchive: {
          objectKey: "k",
          checksumSha256: declaredChecksum,
          sizeBytes: 2 // one less than the upload
        },
        entrypointPath: "x"
      }
    });
    assert.equal(enq.statusCode, 202);
    const buildId = (enq.json() as { build: { buildId: string } }).build.buildId;

    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: declared
    });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.match(body.message, /size/i);
    assert.equal(body.expected, 2);
    assert.equal(body.actual, declared.length);
    await app.close();
  });

  it("returns 404 when the build does not exist", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/builds/00000000-0000-0000-0000-000000000000/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("orphan")
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("returns 400 when the content type is not application/octet-stream", async () => {
    const app = await buildApp();
    const archive = Buffer.from("any");
    const { buildId } = await makeBuildWithArchive(app, archive);
    const res = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/json" },
      payload: { not: "octet-stream" }
    });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.match(body.message, /octet-stream/i);
    await app.close();
  });
});

describe("GET /builds/:buildId/source (TASK-066)", () => {
  it("returns 404 when no archive has been uploaded", async () => {
    const app = await buildApp();
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: {
        appName: "p-source-get",
        requestedBy: "yklee",
        sourceArchive: { objectKey: "k", checksumSha256: "x", sizeBytes: 1 },
        entrypointPath: "x"
      }
    });
    assert.equal(enq.statusCode, 202);
    const buildId = (enq.json() as { build: { buildId: string } }).build.buildId;

    const res = await app.inject({
      method: "GET",
      url: `/builds/${buildId}/source`
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("returns 200 with bytes and X-Source-Checksum-Sha256 header after a successful upload", async () => {
    const app = await buildApp();
    const archive = Buffer.from("roundtrip-archive-bytes");
    const checksum = createHash("sha256").update(archive).digest("hex");
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: {
        appName: "p-source-roundtrip",
        requestedBy: "yklee",
        sourceArchive: {
          objectKey: "k",
          checksumSha256: checksum,
          sizeBytes: archive.byteLength
        },
        entrypointPath: "x"
      }
    });
    const buildId = (enq.json() as { build: { buildId: string } }).build.buildId;

    const upload = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: archive
    });
    assert.equal(upload.statusCode, 201);

    const res = await app.inject({
      method: "GET",
      url: `/builds/${buildId}/source`
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/octet-stream");
    assert.equal(res.headers["x-source-checksum-sha256"], checksum);
    assert.equal(res.headers["x-source-size-bytes"], String(archive.byteLength));
    assert.equal(res.rawPayload.byteLength, archive.byteLength);
    assert.equal(Buffer.compare(res.rawPayload, archive), 0);
    await app.close();
  });
});

describe("DELETE /builds/:buildId/source (TASK-066)", () => {
  async function makeBuildWithArchive(
    app: Awaited<ReturnType<typeof buildApp>>,
    archiveBytes: Buffer
  ) {
    const checksum = createHash("sha256").update(archiveBytes).digest("hex");
    const enq = await app.inject({
      method: "POST",
      url: "/builds",
      payload: {
        appName: `p-del-${Math.random().toString(36).slice(2, 8)}`,
        requestedBy: "yklee",
        sourceArchive: {
          objectKey: "k",
          checksumSha256: checksum,
          sizeBytes: archiveBytes.byteLength
        },
        entrypointPath: "x"
      }
    });
    assert.equal(enq.statusCode, 202);
    return {
      buildId: (enq.json() as { build: { buildId: string } }).build.buildId,
      checksum
    };
  }

  it("returns 204 and the archive is gone afterwards", async () => {
    const app = await buildApp();
    const archive = Buffer.from("delete-me");
    const { buildId } = await makeBuildWithArchive(app, archive);

    const upload = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: archive
    });
    assert.equal(upload.statusCode, 201);

    const del = await app.inject({
      method: "DELETE",
      url: `/builds/${buildId}/source`
    });
    assert.equal(del.statusCode, 204);

    // Verify the archive is actually gone (GET → 404).
    const get = await app.inject({
      method: "GET",
      url: `/builds/${buildId}/source`
    });
    assert.equal(get.statusCode, 404);
    await app.close();
  });

  it("returns 404 when the build does not exist", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/builds/00000000-0000-0000-0000-000000000000/source"
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("returns 400 on a non-UUID buildId", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/builds/x-not-a-uuid/source"
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 404 when deleting again (idempotent failure surfaces as 404)", async () => {
    const app = await buildApp();
    const archive = Buffer.from("twice");
    const { buildId } = await makeBuildWithArchive(app, archive);
    await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: archive
    });
    // First delete: 204.
    const first = await app.inject({
      method: "DELETE",
      url: `/builds/${buildId}/source`
    });
    assert.equal(first.statusCode, 204);
    // Second delete: archive already gone, repo reports
    // `not_found` and the route returns 404. Not strictly
    // idempotent in the HTTP sense — but the caller can
    // safely retry the POST to re-upload.
    const second = await app.inject({
      method: "DELETE",
      url: `/builds/${buildId}/source`
    });
    assert.equal(second.statusCode, 404);
    await app.close();
  });

  it("preserves the build row and allows re-upload after delete", async () => {
    // After DELETE the build should still be queryable and its
    // declared `sourceArchive` metadata (objectKey, sha256,
    // size) should be intact so the Skill can re-upload under
    // the same buildId without going through `POST /builds`.
    const app = await buildApp();
    const archive = Buffer.from("resurrect");
    const { buildId, checksum } = await makeBuildWithArchive(app, archive);

    await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: archive
    });
    const del = await app.inject({
      method: "DELETE",
      url: `/builds/${buildId}/source`
    });
    assert.equal(del.statusCode, 204);

    // Re-upload under the same buildId is 201 and matches the
    // declared metadata.
    const reupload = await app.inject({
      method: "POST",
      url: `/builds/${buildId}/source`,
      headers: { "content-type": "application/octet-stream" },
      payload: archive
    });
    assert.equal(reupload.statusCode, 201);
    assert.equal(reupload.json().checksumSha256, checksum);
    await app.close();
  });
});

// TASK-127: these three handlers used bare `schema.parse(...)` instead of
// the `safeParse` + 400 contract every other handler in this file follows
// (the convention is stated at the top of `build-routes.ts`). A schema
// violation therefore threw a ZodError that escaped to Fastify's default
// error handler and surfaced as a 500 — a server-fault status for what is
// squarely a client error. There were no route-level tests for these three
// endpoints at all, which is why it went unnoticed. These guards pin the
// status codes so the contract cannot silently regress again.
describe("POST /builds (TASK-127 request validation)", () => {
  it("returns 202 for a well-formed payload", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/builds",
      payload: { ...baseBody, appName: "task-127-ok" }
    });
    assert.equal(res.statusCode, 202);
    assert.equal(res.json().accepted, true);
    await app.close();
  });

  it("returns 400 (not 500) when required fields are missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/builds",
      payload: { appName: "task-127-partial" }
    });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.message, "Invalid build request payload");
    // The zod issues are surfaced so the caller can see which fields
    // failed rather than getting an opaque server error.
    assert.ok(Array.isArray(body.issues));
    const paths = body.issues.map((issue: { path: string[] }) => issue.path[0]);
    assert.ok(paths.includes("requestedBy"));
    assert.ok(paths.includes("sourceArchive"));
    assert.ok(paths.includes("entrypointPath"));
    await app.close();
  });

  it("returns 400 (not 500) for an empty body", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/builds", payload: {} });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 (not 500) when a field has the wrong type", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/builds",
      payload: { ...baseBody, appName: 12345 }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe("GET /builds/:buildId (TASK-127 param validation)", () => {
  it("returns 400 (not 500) for a non-UUID buildId", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/builds/not-a-uuid" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().message, "Invalid buildId parameter");
    await app.close();
  });

  it("still returns 404 for a well-formed but unknown buildId", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/builds/00000000-0000-0000-0000-000000000000"
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });
});

describe("GET /builds/:buildId/logs (TASK-127 param validation)", () => {
  it("returns 400 (not 500) for a non-UUID buildId", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/builds/not-a-uuid/logs" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().message, "Invalid buildId parameter");
    await app.close();
  });

  it("still returns 404 for a well-formed but unknown buildId", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/builds/00000000-0000-0000-0000-000000000000/logs"
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });
});
