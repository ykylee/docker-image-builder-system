import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import Fastify, { type FastifyInstance } from "fastify";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { createAdminAllowList, registerAdminRoutes } from "../src/routes/admin-routes.js";
import { BuildService } from "../src/services/build-service.js";

// TASK-069: /admin/runners/* 의 HTTP surface 검증. X-Admin-Id guard
// (TASK-004/049 의 ADMIN 패턴) + body validation + PATCH 토글이 곧바로
// BuildService.claimNextBuild 의 DISABLED gate 에 반영되는 end-to-end
// 동작을 모두 다룬다.

async function buildAppWithService(service: BuildService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerAdminRoutes(app, service, createAdminAllowList(["admin"]));
  return app;
}

describe("admin runners guard (TASK-069)", () => {
  it("GET /admin/runners returns 401 when X-Admin-Id header is missing", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({ method: "GET", url: "/admin/runners" });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("GET /admin/runners returns 403 for a non-admin caller", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "GET",
      url: "/admin/runners",
      headers: { "x-admin-id": "alice" }
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });
});

describe("GET /admin/runners", () => {
  it("returns empty list when no runner has ever claimed a build", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "GET",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { runners: [] });
    await app.close();
  });
});

describe("PATCH /admin/runners/:runnerId", () => {
  it("returns 404 for an unknown runner id", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "PATCH",
      url: "/admin/runners/never-seen",
      headers: { "x-admin-id": "admin", "content-type": "application/json" },
      payload: { status: "DISABLED" }
    });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it("returns 400 for an invalid status value", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "PATCH",
      url: "/admin/runners/abc",
      headers: { "x-admin-id": "admin", "content-type": "application/json" },
      payload: { status: "PAUSED" }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe("DELETE /admin/runners/:runnerId", () => {
  it("returns 200 with removed=false for an unknown runner id", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/runners/never-seen",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { removedRunnerId: "never-seen" });
    await app.close();
  });
});

describe("TASK-069 end-to-end: DISABLED toggle blocks future claims", () => {
  it("claim by a DISABLED runner is rejected with RUNNER_DISABLED reason", async () => {
    // memory repo 의 `runners` Map 은 module-scope 이라 두 repo instance 가
    // 동일 registry 를 공유한다. 그래서 한 쪽에서 register, 다른 쪽에서
    // setStatus → 다른 쪽 service 가 그 register 를 본다.
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const id = "runner-A-dis";
    await repo.registerRunner(id);
    await repo.setRunnerStatus(id, "DISABLED");

    const claim = await service.claimNextBuild(id);
    assert.equal(claim.claimed, false);
    assert.equal(claim.reason, "RUNNER_DISABLED");
    assert.equal(claim.build, null);
  });

  it("ACTIVE toggle on a previously-DISABLED runner re-enables the claim path", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const id = "runner-A-active";
    await repo.registerRunner(id);
    await repo.setRunnerStatus(id, "DISABLED");
    const blocked = await service.claimNextBuild(id);
    assert.equal(blocked.reason, "RUNNER_DISABLED");

    await repo.setRunnerStatus(id, "ACTIVE");
    const allowed = await service.claimNextBuild(id);
    assert.notEqual(allowed.reason, "RUNNER_DISABLED");
  });

  it("self-register on first claim emits the canonical ACTIVE record", async () => {
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const id = "runner-self-register";
    const r = await service.claimNextBuild(id);
    assert.equal(r.claimed, false);
    assert.equal(r.reason, "NO_BUILD_AVAILABLE");

    const list = await repo.listRunners();
    const found = list.runners.find((x) => x.runnerId === id);
    assert.ok(found, "self-register 가 호출되어야 한다");
    assert.equal(found?.status, "ACTIVE");
    assert.equal(found?.buildsClaimed, 0);
  });
});

// TASK-077: admin-initiated runner registration. POST /admin/runners 의
// HTTP surface 검증 — 401 (header missing) / 403 (non-admin) / 201
// (created) / 400 (invalid body) / 409 (duplicate runnerId) /
// pre-registered record 가 list 의 ACTIVE 로 노출되는지.
describe("POST /admin/runners (TASK-077)", () => {
  it("returns 401 when X-Admin-Id header is missing", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "POST",
      url: "/admin/runners",
      payload: { runnerId: "runner-pre" }
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("returns 403 for a non-admin caller", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "alice" },
      payload: { runnerId: "runner-pre" }
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });

  it("returns 400 for empty runnerId", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" },
      payload: { runnerId: "   " }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 400 for extra fields (strict schema)", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" },
      payload: { runnerId: "runner-pre", extra: "field-not-allowed" }
    });
    // strict schema — extra fields 가 safeParse 의 issues 에 포함되어 400.
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("returns 201 with a fresh ACTIVE record on first registration", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const res = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" },
      payload: { runnerId: "runner-pre-1" }
    });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.runner.runnerId, "runner-pre-1");
    assert.equal(body.runner.status, "ACTIVE");
    assert.equal(body.runner.buildsClaimed, 0);
    assert.equal(body.runner.buildsCompleted, 0);
    assert.equal(body.runner.currentBuildId, null);
    assert.equal(body.runner.lastError, null);
    assert.ok(typeof body.runner.firstSeenAt === "string");
    assert.ok(typeof body.runner.lastSeenAt === "string");
    await app.close();
  });

  it("returns 409 on duplicate runnerId", async () => {
    const repo = createMemoryBuildRepository();
    const app = await buildAppWithService(new BuildService(repo));
    const first = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" },
      payload: { runnerId: "runner-dup" }
    });
    assert.equal(first.statusCode, 201);

    const second = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" },
      payload: { runnerId: "runner-dup" }
    });
    assert.equal(second.statusCode, 409);
    await app.close();
  });

  it("returns 409 if the runnerId was previously self-registered by a claim", async () => {
    // Self-register on first claim 의 edge case — 같은 runnerId 가
    // admin pre-registration 와 claim 의 양쪽 surface 에 등장하면 duplicate
    // 으로 처리 (서로 같은 record 이므로).
    const repo = createMemoryBuildRepository();
    const service = new BuildService(repo);
    const app = await buildAppWithService(service);
    // Step 1: runner 가 첫 claim 으로 self-register.
    await service.claimNextBuild("runner-self-then-admin");
    // Step 2: admin 이 같은 id 로 pre-registration 시도 → 409.
    const res = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" },
      payload: { runnerId: "runner-self-then-admin" }
    });
    assert.equal(res.statusCode, 409);
    await app.close();
  });

  it("pre-registered runner appears in GET /admin/runners as ACTIVE", async () => {
    const app = await buildAppWithService(
      new BuildService(createMemoryBuildRepository())
    );
    const created = await app.inject({
      method: "POST",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" },
      payload: { runnerId: "runner-appearing" }
    });
    assert.equal(created.statusCode, 201);

    const list = await app.inject({
      method: "GET",
      url: "/admin/runners",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(list.statusCode, 200);
    const body = list.json();
    const found = body.runners.find(
      (x: { runnerId: string }) => x.runnerId === "runner-appearing"
    );
    assert.ok(found, "pre-registered runner 가 list 에 보여야 한다");
    assert.equal(found.status, "ACTIVE");
    await app.close();
  });
});

