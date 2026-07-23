import { createHash, randomBytes } from "node:crypto";
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

// TASK-080: helper that produces a real archive payload (so the
// repository's checksum/size re-check passes) for the source-gate
// regression tests below. The `sourceArchive` metadata on the build
// request must match the bytes actually uploaded; otherwise the
// upload is rejected as a checksum/size mismatch and the source
// gate stays closed.
function archivePayload(seed: string): {
  bytes: Uint8Array;
  checksumSha256: string;
  sizeBytes: number;
} {
  const bytes = new Uint8Array(randomBytes(64));
  // Stamp the seed into the metadata so multiple payloads in the
  // same test file do not collide on identical bytes.
  bytes[0] = seed.charCodeAt(0) & 0xff;
  const checksumSha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  return { bytes, checksumSha256, sizeBytes: bytes.byteLength };
}

// seedBuild creates a build + uploads its source archive in one
// step. The repository's checksum/size re-check requires the
// declared SourceArchive metadata to match the actual bytes, so
// this helper computes a fresh payload per call and threads the
// SHA-256 + size into the createBuild call. Returns the buildId
// so callers can chain further repository operations.
async function seedBuild(
  repo: ReturnType<typeof createMemoryBuildRepository>,
  request: {
    appName: string;
    requestedBy: string;
    entrypointPath?: string;
    objectKey?: string;
  }
): Promise<string> {
  const payload = archivePayload(request.appName);
  const created = await repo.createBuild({
    appName: request.appName,
    requestedBy: request.requestedBy,
    sourceArchive: {
      objectKey: request.objectKey ?? `src/${request.appName}/archive.tar.gz`,
      checksumSha256: payload.checksumSha256,
      sizeBytes: payload.sizeBytes
    },
    entrypointPath: request.entrypointPath ?? "src/index.ts"
  });
  if (created.kind !== "accepted") {
    throw new Error(`seed failed for ${request.appName}: ${created.kind}`);
  }
  const buildId = created.response.build.buildId;
  const upload = await repo.storeSourceArchive(
    buildId,
    payload.bytes,
    payload.checksumSha256,
    payload.sizeBytes
  );
  if (upload.kind !== "ok") {
    throw new Error(`seed upload failed for ${request.appName}: ${upload.kind}`);
  }
  return buildId;
}

async function createWithUploadedSource(
  appName: string,
  requestedBy: string
): Promise<{ repo: ReturnType<typeof createMemoryBuildRepository>; buildId: string }> {
  const repo = createMemoryBuildRepository();
  const buildId = await seedBuild(repo, { appName, requestedBy });
  return { repo, buildId };
}

describe("MemoryBuildRepository: claimNextBuild", () => {
  it("returns no_build_available when queue is empty", async () => {
    const repo = createMemoryBuildRepository();
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "no_build_available");
  });

  it("claims oldest QUEUED build and transitions to CLAIMED + QUEUE_CLAIMED", async () => {
    const repo = createMemoryBuildRepository();
    await seedBuild(repo, { appName: baseRequest.appName, requestedBy: baseRequest.requestedBy });

    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.response.build.status, "PREPARING_SOURCE");
    assert.equal(result.response.build.phase, "QUEUE_CLAIMED");
  });

  it("returns active_build_exists when a CLAIMED build is present", async () => {
    const repo = createMemoryBuildRepository();
    await seedBuild(repo, { appName: baseRequest.appName, requestedBy: baseRequest.requestedBy });
    const first = await repo.claimNextBuild();
    assert.equal(first.kind, "claimed");

    // enqueue a 2nd build for a different appName so it isn't blocked by duplicate guard
    await seedBuild(repo, { appName: "app-2", requestedBy: baseRequest.requestedBy });
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "active_build_exists");
    if (result.kind !== "active_build_exists") return;
    assert.equal(result.build.build.status, "PREPARING_SOURCE");
  });

  it("appends QUEUE_CLAIMED log entry on claim", async () => {
    const repo = createMemoryBuildRepository();
    await seedBuild(repo, { appName: baseRequest.appName, requestedBy: baseRequest.requestedBy });
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
    await seedBuild(repo, { appName: baseRequest.appName, requestedBy: baseRequest.requestedBy });
    const first = await repo.claimNextBuild();
    if (first.kind !== "claimed") return;
    const buildId = first.response.build.buildId;
    await repo.updatePhase(buildId, "DOCKER_BUILD_STARTED");
    await repo.updatePhase(buildId, "COMPLETED");
    await seedBuild(repo, { appName: "app-2", requestedBy: baseRequest.requestedBy });
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.response.build.appName, "app-2");
  });
});

// ---------------------------------------------------------------------------
// TASK-080: source-upload race mitigation. The Runner must not be
// allowed to claim a build whose source archive bytes have not yet
// arrived at the Build Server, otherwise the Runner hits a 404 on
// /builds/:id/source and the build fails immediately. The gate is
// applied at `claimNextBuild` — a QUEUED build is only eligible
// once `storeSourceArchive` has produced a row in the archive
// store. These regression cases reproduce the dogfood race
// (`docs/operations/dogfood-e2e-2026-07-06.md` §3.2 — failed builds
// d4b86bb8 / b20f5746 / b9d6d047) and pin the new behavior.
// ---------------------------------------------------------------------------
describe("MemoryBuildRepository: claimNextBuild source gate (TASK-080)", () => {
  it("skips a QUEUED build whose source archive has not been uploaded", async () => {
    const repo = createMemoryBuildRepository();
    const created = await repo.createBuild(baseRequest);
    assert.equal(created.kind, "accepted");
    if (created.kind !== "accepted") return;
    // No storeSourceArchive call — the build is QUEUED but the
    // archive bytes have not arrived. A claim attempt must skip
    // this build rather than race against the upload.
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "no_build_available");
  });

  it("claims a QUEUED build once its source archive has been uploaded", async () => {
    const { repo, buildId } = await createWithUploadedSource("p-gate-1", "yklee");
    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.response.build.buildId, buildId);
    assert.equal(result.response.build.status, "PREPARING_SOURCE");
  });

  it("skips source-less builds while claiming source-ready ones in mixed queue", async () => {
    // p-mixed-a: uploaded, eligible — must be claimed first.
    const { repo, buildId: idA } = await createWithUploadedSource(
      "p-mixed-a",
      "yklee"
    );
    // p-mixed-b: source never uploaded — must be skipped.
    await repo.createBuild({
      ...baseRequest,
      appName: "p-mixed-b"
    });

    const first = await repo.claimNextBuild();
    assert.equal(first.kind, "claimed");
    if (first.kind !== "claimed") return;
    assert.equal(first.response.build.buildId, idA);

    // After p-mixed-a is CLAIMED, the runner polling loop will not
    // pick up p-mixed-b until either source arrives or the build
    // is removed. A claim attempt now must report
    // active_build_exists (p-mixed-a is still in-flight) — never
    // advance to p-mixed-b.
    const second = await repo.claimNextBuild();
    assert.equal(second.kind, "active_build_exists");
    if (second.kind !== "active_build_exists") return;
    assert.equal(second.build.build.buildId, idA);
    assert.notEqual(second.build.build.buildId, "p-mixed-b");
  });

  it("allows a skipped build to be claimed once its source archive arrives", async () => {
    // Reproduce the dogfood race timeline:
    //   T0  POST /builds           → QUEUED, no source
    //   T1  POST /builds/claim     → NO_BUILD_AVAILABLE  (skipped)
    //   T2  POST /builds/:id/source → archive stored
    //   T3  POST /builds/claim     → CLAIMED
    const repo = createMemoryBuildRepository();
    const created = await repo.createBuild(baseRequest);
    if (created.kind !== "accepted") throw new Error("seed failed");
    const buildId = created.response.build.buildId;

    // T1: claim before source upload — must skip.
    const t1 = await repo.claimNextBuild();
    assert.equal(t1.kind, "no_build_available");

    // T2: source upload.
    const payload = archivePayload(baseRequest.appName);
    const upload = await repo.storeSourceArchive(
      buildId,
      payload.bytes,
      payload.checksumSha256,
      payload.sizeBytes
    );
    assert.equal(upload.kind, "ok");

    // T3: next claim cycle — must pick the build up.
    const t3 = await repo.claimNextBuild();
    assert.equal(t3.kind, "claimed");
    if (t3.kind !== "claimed") return;
    assert.equal(t3.response.build.buildId, buildId);
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
    await seedBuild(repo, {
      appName: baseRequest.appName,
      requestedBy: baseRequest.requestedBy
    });
    await new Promise((r) => setTimeout(r, 5));
    await seedBuild(repo, { appName: "p-2", requestedBy: baseRequest.requestedBy });

    const result = await repo.listBuilds({ limit: 50 });
    assert.equal(result.builds.length, 2);
    // b is newer than a → b first
    assert.equal(result.builds[0]?.appName, "p-2");
    assert.equal(result.builds[1]?.appName, "p-1");
    assert.equal(result.nextCursor, null);
  });

  it("filters by status", async () => {
    const repo = createMemoryBuildRepository();
    await seedBuild(repo, { appName: "p-a", requestedBy: baseRequest.requestedBy });
    const bId = await seedBuild(repo, {
      appName: "p-b",
      requestedBy: baseRequest.requestedBy
    });

    // p-a 가 claim 됨 (oldest). p-b 는 직접 COMPLETED phase 로.
    await repo.claimNextBuild();
    await repo.updatePhase(bId, "DOCKER_BUILD_STARTED");
    await repo.updatePhase(bId, "DOCKER_BUILD_COMPLETED");
    await repo.updatePhase(bId, "COMPLETED");

    const all = await repo.listBuilds({ limit: 50 });
    assert.equal(all.builds.length, 2);

    const queued = await repo.listBuilds({ limit: 50, status: "QUEUED" });
    assert.equal(queued.builds.length, 0);

    const completed = await repo.listBuilds({ limit: 50, status: "COMPLETED" });
    assert.equal(completed.builds.length, 1);
    assert.equal(completed.builds[0]?.buildId, bId);
  });

  it("filters by requestedBy (owner)", async () => {
    const repo = createMemoryBuildRepository();
    await seedBuild(repo, { appName: "p-a", requestedBy: "yklee" });
    await seedBuild(repo, { appName: "p-b", requestedBy: "other-user" });

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
      const buildId = await seedBuild(repo, {
        appName: `app-${i}`,
        requestedBy: baseRequest.requestedBy
      });
      ids.push(buildId);
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

// ---------------------------------------------------------------------------
// TASK-081: multi-runner concurrent claim regression guard. When
// two or more Runners poll `/builds/claim` simultaneously, the
// repository must guarantee that a single QUEUED build is claimed
// exactly once — and that the active-build gate releases only
// after the in-flight build reaches a terminal phase
// (COMPLETED/FAILED). Node.js executes synchronous code on a
// single thread, but the BuildService wraps
// `repository.claimNextBuild()` in two await calls
// (`registerRunner` + `markRunnerSeen`) — so a second Runner can
// enter `claimNextBuild` between the first's claim and the first's
// registry update. The `active_build_exists` early-return in
// `claimNextBuild` is the server-side guard.
//
// Production semantic across N build slots and M concurrent
// Runners:
//
//   - Within a single claim cycle, exactly one Runner wins the
//     oldest QUEUED build (`claimed`); the remaining Runners see
//     `active_build_exists` and the queue holds.
//   - After the winning Runner drives the build to a terminal
//     phase (COMPLETED / FAILED), the next claim cycle advances
//     to the next-oldest QUEUED build.
//
// These cases pin that semantic at the repository layer. The
// companion `docs/operations/multi-runner-claim-2026-07-XX.md`
// runs the same scenarios against a real multi-runner compose
// deployment for the e2e confirmation.
// ---------------------------------------------------------------------------
describe("MemoryBuildRepository: claimNextBuild multi-runner atomic (TASK-081)", () => {
  async function seedNQueueBuilds(
    repo: ReturnType<typeof createMemoryBuildRepository>,
    count: number
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const buildId = await seedBuild(repo, {
        appName: `p-race-${i}-${Math.random().toString(36).slice(2, 8)}`,
        requestedBy: "yklee"
      });
      ids.push(buildId);
    }
    return ids;
  }

  // Drive a build from CLAIMED to COMPLETED so the next claim
  // cycle can advance. The runner's full lifecycle is
  // DOCKER_BUILD_STARTED → ... → COMPLETED; we shortcut to
  // COMPLETED because `claimNextBuild` only checks `status in
  // {CLAIMED, BUILDING, TEST_READY}` — anything else releases
  // the active slot.
  async function releaseClaimedBuild(
    repo: ReturnType<typeof createMemoryBuildRepository>,
    buildId: string
  ): Promise<void> {
    const result = await repo.updatePhase(buildId, "COMPLETED");
    if (result.kind !== "ok") {
      throw new Error(`failed to release ${buildId}: ${result.kind}`);
    }
  }

  it("drains N queued builds across N sequential claim cycles (with release between cycles)", async () => {
    const repo = createMemoryBuildRepository();
    const ids = await seedNQueueBuilds(repo, 3);

    // Cycle 1: claim the oldest build.
    const first = await repo.claimNextBuild();
    assert.equal(first.kind, "claimed");
    if (first.kind !== "claimed") return;
    assert.equal(first.response.build.buildId, ids[0]);
    await releaseClaimedBuild(repo, first.response.build.buildId);

    // Cycle 2: claim the next-oldest.
    const second = await repo.claimNextBuild();
    assert.equal(second.kind, "claimed");
    if (second.kind !== "claimed") return;
    assert.equal(second.response.build.buildId, ids[1]);
    await releaseClaimedBuild(repo, second.response.build.buildId);

    // Cycle 3: claim the third.
    const third = await repo.claimNextBuild();
    assert.equal(third.kind, "claimed");
    if (third.kind !== "claimed") return;
    assert.equal(third.response.build.buildId, ids[2]);
    await releaseClaimedBuild(repo, third.response.build.buildId);

    // Cycle 4: queue drained.
    const empty = await repo.claimNextBuild();
    assert.equal(empty.kind, "no_build_available");
  });

  it("yields exactly 1 claim + (N-1) active_build_exists when N runners race N builds in one cycle", async () => {
    const repo = createMemoryBuildRepository();
    const ids = await seedNQueueBuilds(repo, 5);

    // Five Runners poll `/builds/claim` simultaneously. The
    // server-side `active_build_exists` check (and the
    // "skip source-less builds" gate from TASK-080) must yield
    // exactly one `claimed` per cycle — never a duplicate build
    // for any Runner, never a missing build for the oldest entry.
    const results = await Promise.all([
      repo.claimNextBuild(),
      repo.claimNextBuild(),
      repo.claimNextBuild(),
      repo.claimNextBuild(),
      repo.claimNextBuild()
    ]);

    const claimed = results.filter((r) => r.kind === "claimed");
    const active = results.filter((r) => r.kind === "active_build_exists");

    // Single-cycle guarantee: exactly 1 claim + 4 active. This
    // is the production semantic — the first Runner wins, the
    // other 4 see `active_build_exists` until the in-flight build
    // reaches a terminal phase.
    assert.equal(claimed.length, 1, "exactly one Runner wins per cycle");
    assert.equal(active.length, 4, "remaining Runners see active_build_exists");
    const activeIds = active.map(
      (r) => (r as { build: { build: { buildId: string } } }).build.build.buildId
    );
    assert.equal(new Set(activeIds).size, 1, "all active responses reference the same in-flight build");

    // The single claimed build must be the oldest of the seeded
    // set — i.e. the first buildId pushed to `ids`.
    const claimedId = (claimed[0] as { response: { build: { buildId: string } } }).response.build.buildId;
    assert.equal(claimedId, ids[0]);
  });

  it("advances across multiple Promise.all cycles after each release", async () => {
    // Two cycles of `Promise.all` with 3 Runners each, against 5
    // builds. Cycle 1 picks the oldest, cycle 2 picks the
    // second-oldest. After cycle 5, the queue is drained.
    const repo = createMemoryBuildRepository();
    const ids = await seedNQueueBuilds(repo, 5);

    const collected: string[] = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      const results = await Promise.all([
        repo.claimNextBuild(),
        repo.claimNextBuild(),
        repo.claimNextBuild()
      ]);
      const claimedThisCycle = results.find((r) => r.kind === "claimed");
      assert.ok(
        claimedThisCycle,
        `cycle ${cycle} must produce at least one claim`
      );
      if (!claimedThisCycle || claimedThisCycle.kind !== "claimed") return;
      const claimedId = claimedThisCycle.response.build.buildId;
      collected.push(claimedId);
      await releaseClaimedBuild(repo, claimedId);
    }

    // All 5 builds claimed in oldest-first order.
    assert.deepEqual(collected, ids);

    // One more cycle: queue drained.
    const drained = await Promise.all([
      repo.claimNextBuild(),
      repo.claimNextBuild(),
      repo.claimNextBuild()
    ]);
    for (const r of drained) {
      assert.equal(r.kind, "no_build_available");
    }
  });

  it("yields 1 claim + (M-1) active_build_exists for M runners against K<M builds", async () => {
    // 3 Runners race for 2 builds. Cycle 1 picks 1 build, the
    // other 2 Runners see active_build_exists. After release,
    // cycle 2 picks the second build.
    const repo = createMemoryBuildRepository();
    const ids = await seedNQueueBuilds(repo, 2);

    const results = await Promise.all([
      repo.claimNextBuild(),
      repo.claimNextBuild(),
      repo.claimNextBuild()
    ]);

    const claimed = results.filter((r) => r.kind === "claimed");
    const active = results.filter((r) => r.kind === "active_build_exists");
    const empty = results.filter((r) => r.kind === "no_build_available");

    assert.equal(claimed.length, 1, "exactly one Runner wins when M > K");
    assert.equal(active.length, 2, "remaining M-1 Runners see active_build_exists");
    assert.equal(empty.length, 0, "no Runner should see no_build_available while K>0 are queued");

    // After releasing the in-flight build, the second cycle
    // claims the remaining build.
    const claimedId = (claimed[0] as { response: { build: { buildId: string } } }).response.build.buildId;
    await releaseClaimedBuild(repo, claimedId);
    const secondCycle = await repo.claimNextBuild();
    assert.equal(secondCycle.kind, "claimed");
    if (secondCycle.kind !== "claimed") return;
    const secondId = secondCycle.response.build.buildId;
    assert.deepEqual([claimedId, secondId].sort(), [ids[0], ids[1]].sort());
  });
});

// TASK-154: chunked 업로드 source-gate 회귀 가드.
//
// TASK-080 의 source-gate 는 legacy 단일행 저장(`sourceArchives` /
// postgres `build_source`)의 존재만 봤다. 그런데 TASK-106 의 chunked
// 업로드는 **첫 chunk 에서 legacy 항목을 삭제**하고 chunk 저장소에만
// 기록하므로, chunked 로 올린 build 는 자격 판정에서 영원히 탈락해
// runner 가 claim 하지 못했다 (QUEUED/REQUEST_ACCEPTED 무한 정체).
// 아래 테스트가 그 회귀를 고정한다.
describe("MemoryBuildRepository: claimNextBuild — chunked source gate (TASK-154)", () => {
  // 청크 cap 은 ceil(declaredTotal / 1024) 이므로 2 chunk 를 쓰려면
  // 선언 total 이 2048 이어야 한다 (1024 × 2).
  const CHUNK_SIZE = 1024;
  const TOTAL = CHUNK_SIZE * 2;

  async function seedChunkedBuild(
    repo: ReturnType<typeof createMemoryBuildRepository>,
    appName: string,
    chunksToUpload: number
  ): Promise<string> {
    const created = await repo.createBuild({
      appName,
      requestedBy: "yklee",
      sourceArchive: {
        objectKey: `src/${appName}/archive.tar.gz`,
        checksumSha256: "f".repeat(64),
        sizeBytes: TOTAL
      },
      entrypointPath: "src/index.ts"
    });
    if (created.kind !== "accepted") {
      throw new Error(`seed failed for ${appName}: ${created.kind}`);
    }
    const buildId = created.response.build.buildId;
    for (let i = 0; i < chunksToUpload; i += 1) {
      const bytes = new Uint8Array(CHUNK_SIZE).fill(65 + i);
      const perChunk = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
      const res = await repo.storeSourceChunk(buildId, bytes, perChunk, TOTAL);
      if (res.kind !== "ok") {
        throw new Error(`chunk ${i} upload failed: ${res.kind}`);
      }
    }
    return buildId;
  }

  it("claims a build whose source was uploaded via the chunked path", async () => {
    const repo = createMemoryBuildRepository();
    const buildId = await seedChunkedBuild(repo, "chunked-claimable", 2);

    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.response.build.buildId, buildId);
    assert.equal(result.response.build.status, "PREPARING_SOURCE");
    assert.equal(result.response.build.phase, "QUEUE_CLAIMED");
  });

  it("does not claim a build whose chunked upload is still partial", async () => {
    const repo = createMemoryBuildRepository();
    // 2 chunk 중 1 개만 업로드 → 누적 1024 < 선언 2048 → 자격 없음.
    await seedChunkedBuild(repo, "chunked-partial", 1);

    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "no_build_available");
  });

  it("still refuses a build with no source bytes at all (TASK-080 가드 보존)", async () => {
    const repo = createMemoryBuildRepository();
    const created = await repo.createBuild({
      appName: "no-source",
      requestedBy: "yklee",
      sourceArchive: {
        objectKey: "src/no-source/archive.tar.gz",
        checksumSha256: "f".repeat(64),
        sizeBytes: 0
      },
      entrypointPath: "src/index.ts"
    });
    assert.equal(created.kind, "accepted");

    const result = await repo.claimNextBuild();
    assert.equal(result.kind, "no_build_available");
  });
});
