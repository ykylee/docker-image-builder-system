import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";

// TASK-069: in-memory repo 의 runner registry 동작 검증. claim registry
// 게이트 (DISABLED 거절) + register idempotency + counter ++ + admin list /
// patch / delete 시나리오를 모두 다룬다.

describe("MemoryBuildRepository: runner registry (TASK-069)", () => {
  // Module-scope `runners` Map 가 테스트 간 공유되므로 (현재 memory
  // repo 의 동일 패턴 — sourceArchives 와 같은 의도) 각 테스트는 unique id
  // prefix 로 충돌을 회피한다. listRunners 검증은 prefix 별도.
  const testRunId = (name: string) => `rr-${name}`;

  it("registerRunner creates a fresh ACTIVE record on first call", async () => {
    const repo = createMemoryBuildRepository();
    const r = await repo.registerRunner(testRunId("active-create"));
    assert.equal(r.runnerId, testRunId("active-create"));
    assert.equal(r.status, "ACTIVE");
    assert.equal(r.buildsClaimed, 0);
    assert.equal(r.buildsCompleted, 0);
    assert.equal(r.currentBuildId, null);
    assert.equal(r.lastError, null);
    // firstSeenAt 와 lastSeenAt 가 동일 (방금 등록).
    assert.equal(r.firstSeenAt, r.lastSeenAt);
  });

  it("registerRunner is idempotent — preserves admin's status toggle", async () => {
    const repo = createMemoryBuildRepository();
    const id = testRunId("idempotent");
    await repo.registerRunner(id);
    await repo.setRunnerStatus(id, "DISABLED");
    // Restart 시뮬레이션 — Runner 가 다시 register 를 부름.
    const r = await repo.registerRunner(id);
    assert.equal(r.status, "DISABLED", "status 는 admin 의 DISABLED 토글 유지");
    assert.equal(r.buildsClaimed, 0);
    assert.equal(r.buildsCompleted, 0);
  });

  it("markRunnerSeen on 'claimed' bumps buildsClaimed + sets currentBuildId", async () => {
    const repo = createMemoryBuildRepository();
    const id = testRunId("claimed");
    await repo.registerRunner(id);
    const r = await repo.markRunnerSeen(id, "build-1", "claimed");
    assert.equal(r?.buildsClaimed, 1);
    assert.equal(r?.currentBuildId, "build-1");
  });

  it("markRunnerSeen on 'completed' bumps buildsCompleted + clears currentBuildId", async () => {
    const repo = createMemoryBuildRepository();
    const id = testRunId("completed");
    await repo.registerRunner(id);
    await repo.markRunnerSeen(id, "build-1", "claimed");
    const r = await repo.markRunnerSeen(id, null, "completed");
    assert.equal(r?.buildsClaimed, 1);
    assert.equal(r?.buildsCompleted, 1);
    assert.equal(r?.currentBuildId, null);
  });

  it("markRunnerSeen on 'failed' clears currentBuildId but does not bump completed", async () => {
    const repo = createMemoryBuildRepository();
    const id = testRunId("failed");
    await repo.registerRunner(id);
    await repo.markRunnerSeen(id, "build-1", "claimed");
    const r = await repo.markRunnerSeen(id, null, "failed");
    assert.equal(r?.buildsClaimed, 1);
    assert.equal(r?.buildsCompleted, 0);
    assert.equal(r?.currentBuildId, null);
  });

  it("markRunnerSeen returns null for unknown runner (no auto-register side-effect)", async () => {
    const repo = createMemoryBuildRepository();
    const r = await repo.markRunnerSeen(`${testRunId("never")}-seen`, null, "claimed");
    assert.equal(r, null);
  });

  it("listRunners returns sorted-by-id snapshot of the inserted fixtures", async () => {
    const repo = createMemoryBuildRepository();
    // 3개 의 prefix 별 fixture 만 sorting 검증 — 다른 테스트가 더해놓은
    // entries 가 섞여있어도 prefix 로 filter 후 검증한다.
    const prefix = "rr-list-";
    await repo.registerRunner(`${prefix}z`);
    await repo.registerRunner(`${prefix}a`);
    await repo.registerRunner(`${prefix}m`);
    const list = await repo.listRunners();
    assert.deepEqual(
      list.runners
        .filter((r) => r.runnerId.startsWith(prefix))
        .map((r) => r.runnerId),
      [`${prefix}a`, `${prefix}m`, `${prefix}z`]
    );
  });

  it("setRunnerStatus flips ACTIVE <-> DISABLED", async () => {
    const repo = createMemoryBuildRepository();
    const id = testRunId("status");
    await repo.registerRunner(id);
    const a = await repo.setRunnerStatus(id, "DISABLED");
    assert.equal(a?.status, "DISABLED");
    const b = await repo.setRunnerStatus(id, "ACTIVE");
    assert.equal(b?.status, "ACTIVE");
    // unknown runner returns null
    assert.equal(await repo.setRunnerStatus(`${id}-nonexistent`, "DISABLED"), null);
  });

  it("deleteRunner removes the record and returns removed flag", async () => {
    const repo = createMemoryBuildRepository();
    const id = testRunId("delete");
    await repo.registerRunner(id);
    const r = await repo.deleteRunner(id);
    assert.deepEqual(r, { removed: true });
    // 다시 호출: removed=false.
    assert.deepEqual(await repo.deleteRunner(id), { removed: false });
    // delete 한 record 는 list 에 없음.
    const list = await repo.listRunners();
    assert.equal(
      list.runners.find((x) => x.runnerId === id),
      undefined
    );
  });

  it("getRunnerStatus returns null for unknown, ACTIVE/DISABLED for known", async () => {
    const repo = createMemoryBuildRepository();
    const id = testRunId("get");
    assert.equal(await repo.getRunnerStatus(`${id}-unknown`), null);
    await repo.registerRunner(id);
    assert.equal(await repo.getRunnerStatus(id), "ACTIVE");
    await repo.setRunnerStatus(id, "DISABLED");
    assert.equal(await repo.getRunnerStatus(id), "DISABLED");
  });
});
