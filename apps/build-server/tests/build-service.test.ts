import { createHash, randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { BuildService } from "../src/services/build-service.js";

// TASK-080: claimNextBuild now requires the source archive bytes to
// have been uploaded before a QUEUED build is eligible. The build
// helper threads a real (dummy) archive through createBuild +
// storeSourceArchive so downstream claim tests do not need to
// re-arrange their fixtures beyond swapping the call site.
async function createBuildWithSource(
  service: BuildService,
  partial: {
    appName: string;
    requestedBy: string;
    sourceArchive?: { objectKey: string; checksumSha256: string; sizeBytes: number };
    entrypointPath?: string;
    dockerfileMode?: "required" | "auto";
  }
): Promise<{ buildId: string }> {
  const bytes = new Uint8Array(randomBytes(64));
  const checksumSha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const sizeBytes = bytes.byteLength;
  const create = await service.createBuild({
    appName: partial.appName,
    requestedBy: partial.requestedBy,
    sourceArchive: partial.sourceArchive ?? {
      objectKey: `src/${partial.appName}/archive.tar.gz`,
      checksumSha256,
      sizeBytes
    },
    entrypointPath: partial.entrypointPath ?? "src/index.ts",
    dockerfileMode: partial.dockerfileMode
  });
  if (create.kind !== "accepted") {
    throw new Error(
      `createBuildWithSource: expected accepted, got ${JSON.stringify(create)}`
    );
  }
  const buildId = create.response.build.buildId;
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

const baseRequest = {
  appName: "p-1",
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
    await createBuildWithSource(service, baseRequest);
    const result = await service.claimNextBuild();
    assert.equal(result.claimed, true);
    assert.equal(result.reason, null);
    assert.equal(result.build?.build.status, "PREPARING_SOURCE");
    assert.equal(result.build?.build.phase, "QUEUE_CLAIMED");
  });

  it("preserves auto Dockerfile mode through the claim response", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    await createBuildWithSource(service, {
      ...baseRequest,
      appName: "auto-dockerfile-app",
      dockerfileMode: "auto",
    });

    const result = await service.claimNextBuild();

    assert.equal(result.claimed, true);
    assert.equal(result.build?.build.dockerfileMode, "auto");
  });

  it("returns ACTIVE_BUILD_EXISTS when a build is already in flight", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    await createBuildWithSource(service, baseRequest);
    const first = await service.claimNextBuild();
    assert.equal(first.claimed, true);
    await createBuildWithSource(service, { ...baseRequest, appName: "app-2" });
    const second = await service.claimNextBuild();
    assert.equal(second.claimed, false);
    assert.equal(second.reason, "ACTIVE_BUILD_EXISTS");
    assert.equal(second.build?.build.status, "PREPARING_SOURCE");
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
    const { buildId } = await createBuildWithSource(service, baseRequest);
    const result = await service.reportPhase(buildId, "DOCKER_BUILD_STARTED");
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.response.build.phase, "DOCKER_BUILD_STARTED");
    assert.equal(result.response.build.status, "BUILDING");
  });
});
