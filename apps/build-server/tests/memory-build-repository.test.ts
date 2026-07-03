import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";

const baseRequest = {
  appName: "p-1",
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
    await repo.createBuild({ ...baseRequest, appName: "app-2" });
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
    await repo.createBuild({ ...baseRequest, appName: "app-2" });
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.response.build.appName, "app-2");
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

describe("MemoryBuildRepository: listBuilds", () => {
  const baseRequest = {
    appName: "p-1",
    requestedBy: "yklee",
    sourceArchive: {
      objectKey: "src/p-1/r-1/abc.tar.gz",
      checksumSha256: "deadbeef",
      sizeBytes: 1024
    },
    entrypointPath: "src/index.ts"
  };

  it("returns empty page when no builds exist", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.listBuilds({ limit: 50 });
    assert.equal(result.builds.length, 0);
    assert.equal(result.nextCursor, null);
  });

  it("returns all builds in createdAt-desc order", async () => {
    const repo = createMemoryBuildRepository();
    const a = await repo.createBuild(baseRequest);
    await new Promise((r) => setTimeout(r, 5));
    const b = await repo.createBuild({
      ...baseRequest,
      appName: "p-2"
    });
    assert.equal(a.kind, "accepted");
    assert.equal(b.kind, "accepted");

    const result = await repo.listBuilds({ limit: 50 });
    assert.equal(result.builds.length, 2);
    // b is newer than a → b first
    assert.equal(result.builds[0]?.appName, "p-2");
    assert.equal(result.builds[1]?.appName, "p-1");
    assert.equal(result.nextCursor, null);
  });

  it("filters by status", async () => {
    const repo = createMemoryBuildRepository();
    const a = await repo.createBuild({
      ...baseRequest,
      appName: "p-a"
    });
    const b = await repo.createBuild({
      ...baseRequest,
      appName: "p-b"
    });
    if (a.kind !== "accepted" || b.kind !== "accepted") {
      throw new Error("seed failed");
    }
    // b 만 COMPLETED phase 까지 진행. a 는 QUEUED 상태 유지.
    // claimNextBuild 는 oldest 부터 가져가므로 a 가 claim 됨 → a 를
    // 직접 updatePhase 로 QUEUE_CLAIMED → SOURCE_PREPARED → DOCKER_BUILD_*
    // 로 끌고 가서 QUEUED 가 아니게 만든 뒤, b 는 claim 안 한 채로 status
    // 만 직접 update. 대신 간단히: a 는 QUEUED 유지, b 는 CLAIMED +
    // build phases 만 거치고 COMPLETED 로.
    await repo.claimNextBuild();
    // a 가 claim 됨. b 는 QUEUED. b 를 직접 COMPLETED phase 로.
    await repo.updatePhase(b.response.build.buildId, "DOCKER_BUILD_STARTED");
    await repo.updatePhase(b.response.build.buildId, "DOCKER_BUILD_COMPLETED");
    await repo.updatePhase(b.response.build.buildId, "COMPLETED");

    const all = await repo.listBuilds({ limit: 50 });
    assert.equal(all.builds.length, 2);

    const queued = await repo.listBuilds({ limit: 50, status: "QUEUED" });
    assert.equal(queued.builds.length, 0);

    const completed = await repo.listBuilds({ limit: 50, status: "COMPLETED" });
    assert.equal(completed.builds.length, 1);
    assert.equal(completed.builds[0]?.buildId, b.response.build.buildId);
  });

  it("filters by requestedBy (owner)", async () => {
    const repo = createMemoryBuildRepository();
    await repo.createBuild({
      ...baseRequest,
      appName: "p-a",
      requestedBy: "yklee"
    });
    await repo.createBuild({
      ...baseRequest,
      appName: "p-b",
      requestedBy: "other-user"
    });

    const all = await repo.listBuilds({ limit: 50 });
    assert.equal(all.builds.length, 2);

    const mine = await repo.listBuilds({ limit: 50, requestedBy: "yklee" });
    assert.equal(mine.builds.length, 1);
    assert.equal(mine.builds[0]?.appName, "p-a");

    const others = await repo.listBuilds({ limit: 50, requestedBy: "unknown" });
    assert.equal(others.builds.length, 0);
  });

  it("paginates with limit and cursor", async () => {
    const repo = createMemoryBuildRepository();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await repo.createBuild({
        ...baseRequest,
        appName: `app-${i}`
      });
      if (result.kind !== "accepted") throw new Error("seed failed");
      ids.push(result.response.build.buildId);
      await new Promise((r) => setTimeout(r, 2));
    }
    // Newest first → ids reverse
    const expectedNewestFirst = [...ids].reverse();

    const page1 = await repo.listBuilds({ limit: 2 });
    assert.equal(page1.builds.length, 2);
    assert.equal(page1.builds[0]?.buildId, expectedNewestFirst[0]);
    assert.equal(page1.builds[1]?.buildId, expectedNewestFirst[1]);
    assert.equal(page1.nextCursor, expectedNewestFirst[1]);

    const page2 = await repo.listBuilds({
      limit: 2,
      cursor: page1.nextCursor ?? undefined
    });
    assert.equal(page2.builds.length, 2);
    assert.equal(page2.builds[0]?.buildId, expectedNewestFirst[2]);
    assert.equal(page2.builds[1]?.buildId, expectedNewestFirst[3]);
    assert.equal(page2.nextCursor, expectedNewestFirst[3]);

    const page3 = await repo.listBuilds({
      limit: 2,
      cursor: page2.nextCursor ?? undefined
    });
    assert.equal(page3.builds.length, 1);
    assert.equal(page3.builds[0]?.buildId, expectedNewestFirst[4]);
    assert.equal(page3.nextCursor, null);
  });
});

describe("MemoryBuildRepository: phase timeline (TASK-050)", () => {
  const request = {
    appName: "p-tl",
    requestedBy: "yklee",
    sourceArchive: {
      objectKey: "src/p-tl/r-1/abc.tar.gz",
      checksumSha256: "deadbeef",
      sizeBytes: 1024
    },
    entrypointPath: "src/index.ts"
  };

  it("createBuild 응답에 phaseHistory=[] 와 currentPhase=REQUEST_ACCEPTED 가 포함된다", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(request);
    assert.equal(create.kind, "accepted");
    if (create.kind !== "accepted") return;
    assert.deepEqual(create.response.phaseHistory, []);
    assert.deepEqual(create.response.currentPhase, {
      phase: "REQUEST_ACCEPTED",
      startedAt: create.response.build.createdAt
    });
  });

  it("updatePhase 응답이 phaseHistory 에 직전 phase push + currentPhase 갱신", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(request);
    if (create.kind !== "accepted") throw new Error("expected accepted");
    const buildId = create.response.build.buildId;

    // QUEUE_CLAIMED 로 transition.
    const claimed = await repo.updatePhase(buildId, "QUEUE_CLAIMED");
    assert.equal(claimed.kind, "ok");
    if (claimed.kind !== "ok") return;
    assert.deepEqual(claimed.response.phaseHistory, [
      { phase: "REQUEST_ACCEPTED", completedAt: claimed.response.build.updatedAt }
    ]);
    assert.equal(claimed.response.currentPhase?.phase, "QUEUE_CLAIMED");

    // SOURCE_PREPARED 로 transition.
    const sourcePrepared = await repo.updatePhase(buildId, "SOURCE_PREPARED");
    if (sourcePrepared.kind !== "ok") throw new Error("expected ok");
    assert.equal(sourcePrepared.response.phaseHistory.length, 2);
    assert.equal(sourcePrepared.response.phaseHistory[1].phase, "QUEUE_CLAIMED");
    assert.equal(sourcePrepared.response.currentPhase?.phase, "SOURCE_PREPARED");
  });

  it("terminal phase (COMPLETED) 진입 시 currentPhase=null + history 에 terminal 도 push (TASK-050 follow-up)", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(request);
    if (create.kind !== "accepted") throw new Error("expected accepted");
    const buildId = create.response.build.buildId;
    await repo.updatePhase(buildId, "DOCKER_BUILD_STARTED");
    const done = await repo.updatePhase(buildId, "COMPLETED");
    if (done.kind !== "ok") throw new Error("expected ok");
    assert.equal(done.response.currentPhase, null);
    // TASK-050 follow-up: terminal phase (COMPLETED) 도 history 에 push.
    // PhaseTimeline 가 마지막 phase 를 completed 로 정확히 표시하려면 필수.
    const last = done.response.phaseHistory.at(-1);
    assert.ok(last);
    assert.equal(last?.phase, "COMPLETED");
    // 직전 in-flight phase (DOCKER_BUILD_STARTED) 도 여전히 history 에 있다.
    const prevLast = done.response.phaseHistory.at(-2);
    assert.ok(prevLast);
    assert.equal(prevLast?.phase, "DOCKER_BUILD_STARTED");
    // history 길이: REQUEST_ACCEPTED (in-flight initial → push on first update) + DOCKER_BUILD_STARTED + COMPLETED = 3
    assert.equal(done.response.phaseHistory.length, 3);
  });

  it("terminal phase (FAILED) 도 history 에 push", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(request);
    if (create.kind !== "accepted") throw new Error("expected accepted");
    const buildId = create.response.build.buildId;
    await repo.updatePhase(buildId, "DOCKER_BUILD_STARTED");
    const done = await repo.updatePhase(buildId, "FAILED");
    if (done.kind !== "ok") throw new Error("expected ok");
    assert.equal(done.response.currentPhase, null);
    const last = done.response.phaseHistory.at(-1);
    assert.ok(last);
    assert.equal(last?.phase, "FAILED");
  });

  it("같은 phase 로 updatePhase 호출 시 phaseHistory 가 변하지 않는다", async () => {
    const repo = createMemoryBuildRepository();
    const create = await repo.createBuild(request);
    if (create.kind !== "accepted") throw new Error("expected accepted");
    const buildId = create.response.build.buildId;
    const before = (await repo.getBuild(buildId))!;
    // 동일 phase 로 한 번 더.
    const same = await repo.updatePhase(buildId, "REQUEST_ACCEPTED");
    if (same.kind !== "ok") throw new Error("expected ok");
    assert.equal(same.response.phaseHistory.length, before.phaseHistory.length);
  });
});
