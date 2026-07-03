import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";

const baseRequest = (requestedBy: string, projectId: string) => ({
  projectId,
  repositoryId: "r-1",
  requestedBy,
  sourceArchive: {
    objectKey: `src/${projectId}/r-1/abc.tar.gz`,
    checksumSha256: "deadbeef",
    sizeBytes: 1024
  },
  entrypointPath: "src/index.ts"
});

describe("MemoryBuildRepository: admin operations (ADMIN-003)", () => {
  it("listBuildsAcrossUsers returns every owner's builds with requestedBy", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild(baseRequest("alice", "alice-1"));
    await repo.createBuild(baseRequest("bob", "bob-1"));
    await repo.createBuild(baseRequest("alice", "alice-2"));

    const page = await repo.listBuildsAcrossUsers({ limit: 50 });
    assert.equal(page.builds.length, 3);
    assert.equal(page.nextCursor, null);
    // Each entry must carry the owner key so the admin UI can render
    // it without an extra lookup. The owner is the same as the
    // requestedBy on the originating BuildRequest.
    for (const build of page.builds) {
      assert.ok(
        build.requestedBy === "alice" || build.requestedBy === "bob",
        `unexpected owner: ${build.requestedBy}`
      );
    }
  });

  it("listBuildsAcrossUsers honours requestedBy filter (admin view of one user)", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild(baseRequest("alice", "alice-1"));
    await repo.createBuild(baseRequest("bob", "bob-1"));
    await repo.createBuild(baseRequest("alice", "alice-2"));

    const page = await repo.listBuildsAcrossUsers({
      requestedBy: "alice",
      limit: 50
    });
    assert.equal(page.builds.length, 2);
    for (const build of page.builds) {
      assert.equal(build.projectId.startsWith("alice-"), true);
      assert.equal(build.requestedBy, "alice");
    }
  });

  it("listBuildOwners aggregates by requestedBy with buildCount and lastBuildAt", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild(baseRequest("alice", "alice-1"));
    await repo.createBuild(baseRequest("bob", "bob-1"));
    await repo.createBuild(baseRequest("alice", "alice-2"));

    const result = await repo.listBuildOwners();
    const byId = new Map(result.users.map((u) => [u.userId, u]));
    assert.equal(byId.get("alice")?.buildCount, 2);
    assert.equal(byId.get("bob")?.buildCount, 1);
    assert.equal(typeof byId.get("alice")?.lastBuildAt, "string");
    // lastBuildAt is ISO; we only assert both are present and alice >= bob's.
    const aliceLast = byId.get("alice")?.lastBuildAt;
    const bobLast = byId.get("bob")?.lastBuildAt;
    assert.ok(aliceLast && bobLast);
    assert.ok(aliceLast >= bobLast);
  });

  it("listBuildOwners returns empty list when no builds exist", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.listBuildOwners();
    assert.deepEqual(result.users, []);
  });
});
