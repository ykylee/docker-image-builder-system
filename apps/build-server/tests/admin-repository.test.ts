import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";

const baseRequest = (requestedBy: string, appName: string) => ({
  appName,
  requestedBy,
  sourceArchive: {
    objectKey: `src/${appName}/abc.tar.gz`,
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
      assert.equal(build.appName.startsWith("alice-"), true);
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
    const aliceLast = byId.get("alice")?.lastBuildAt;
    const bobLast = byId.get("bob")?.lastBuildAt;
    // Invariant (ADMIN-005): any owner with buildCount > 0 must have
    // a non-null ISO 8601 lastBuildAt. The schema marks the field
    // nullable, but the only way the field can be null is the
    // (currently unreachable) "owner with zero builds" branch —
    // listBuildOwners filters those out via GROUP BY, so a non-null
    // string is the only valid shape for every row in this view.
    assert.equal(typeof aliceLast, "string");
    assert.equal(typeof bobLast, "string");
    assert.ok(aliceLast && bobLast);
    assert.ok(aliceLast >= bobLast);
    // ISO 8601 sanity: round-trip through Date without NaN.
    assert.ok(!Number.isNaN(new Date(aliceLast).getTime()));
    assert.ok(!Number.isNaN(new Date(bobLast).getTime()));
  });

  it("listBuildOwners returns empty list when no builds exist", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.listBuildOwners();
    assert.deepEqual(result.users, []);
  });

  // Cursor pagination (ADMIN-005): listBuildsAcrossUsers 는 listBuilds 와
  // 같은 sort/cursor 파이프라인을 공유한다. limit=2 로 3개 build 중 2개를
  // 받고, 반환된 nextCursor 로 두 번째 페이지를 받아 남은 1개를 받는지
  // 검증한다. createdAt 이 동률인 경우의 stable tiebreak 는
  // PostgresBuildRepository 가 책임지고 (id desc), memory 구현은 단순
  // localeCompare 정렬 — 현 PR 범위에선 createdAt 이 모두 다른 일반
  // 케이스만 보장한다.
  it("listBuildsAcrossUsers paginates with limit + nextCursor (3 builds, limit=2)", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild(baseRequest("alice", "alice-1"));
    await repo.createBuild(baseRequest("bob", "bob-1"));
    await repo.createBuild(baseRequest("alice", "alice-2"));

    const first = await repo.listBuildsAcrossUsers({ limit: 2 });
    assert.equal(first.builds.length, 2);
    assert.ok(typeof first.nextCursor === "string" && first.nextCursor.length > 0);

    const second = await repo.listBuildsAcrossUsers({
      limit: 2,
      cursor: first.nextCursor ?? undefined
    });
    assert.equal(second.builds.length, 1);
    assert.equal(second.nextCursor, null);

    // 두 페이지의 buildId 가 disjoint 한지 (중복/누락 없음).
    const ids = new Set<string>();
    for (const b of first.builds) ids.add(b.buildId);
    for (const b of second.builds) ids.add(b.buildId);
    assert.equal(ids.size, 3, "pages must not overlap or skip");
  });
});
