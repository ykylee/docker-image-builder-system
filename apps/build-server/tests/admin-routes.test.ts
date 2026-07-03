import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import Fastify, { type FastifyInstance } from "fastify";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { createAdminAllowList, registerAdminRoutes } from "../src/routes/admin-routes.js";
import { BuildService } from "../src/services/build-service.js";

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

async function buildAppWithService(
  adminIds: string[],
  service: BuildService
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerAdminRoutes(app, service, createAdminAllowList(adminIds));
  return app;
}

async function seed(service: BuildService): Promise<void> {
  await service.createBuild(baseRequest("alice", "alice-1"));
  await service.createBuild(baseRequest("bob", "bob-1"));
  await service.createBuild(baseRequest("alice", "alice-2"));
}

describe("admin guard (ADMIN-004)", () => {
  it("returns 401 when X-Admin-Id header is missing", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin", "yky.lee"], service);
    const res = await app.inject({ method: "GET", url: "/admin/builds" });
    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.header, "x-admin-id");
    await app.close();
  });

  it("returns 403 when the caller is not in the admin allow-list", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { "x-admin-id": "alice" }
    });
    assert.equal(res.statusCode, 403);
    const body = res.json();
    assert.equal(body.callerId, "alice");
    await app.close();
  });

  it("returns 200 with every owner's builds for an admin caller", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    await seed(service);
    const app = await buildAppWithService(["admin", "yky.lee"], service);

    const res = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.builds.length, 3);
    assert.equal(body.nextCursor, null);

    await app.close();
  });

  it("filters by requestedBy when an admin drill-down is requested", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    await seed(service);
    const app = await buildAppWithService(["admin"], service);

    const res = await app.inject({
      method: "GET",
      url: "/admin/builds?requestedBy=alice",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.builds.length, 2);
    for (const build of body.builds) {
      assert.ok(build.appName.startsWith("alice-"));
    }

    await app.close();
  });
});

describe("GET /admin/users", () => {
  it("returns per-owner buildCount and lastBuildAt for an admin caller", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    await seed(service);
    const app = await buildAppWithService(["admin"], service);

    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    const byId = new Map(
      body.users.map((u: { userId: string; buildCount: number; lastBuildAt: string }) => [
        u.userId,
        u
      ])
    );
    assert.equal(byId.get("alice")?.buildCount, 2);
    assert.equal(byId.get("bob")?.buildCount, 1);

    await app.close();
  });

  it("returns 403 for a non-admin caller", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { "x-admin-id": "alice" }
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });
});

describe("admin allow-list management (ADMIN-049)", () => {
  it("GET /admin/admins returns the current allow-list for an admin caller", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin", "yky.lee"], service);
    const res = await app.inject({
      method: "GET",
      url: "/admin/admins",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.deepEqual(body.admins, ["admin", "yky.lee"]);
    await app.close();
  });

  it("GET /admin/admins returns 403 for a non-admin caller", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({
      method: "GET",
      url: "/admin/admins",
      headers: { "x-admin-id": "alice" }
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });

  it("POST /admin/admins adds a new admin to the live allow-list", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const addRes = await app.inject({
      method: "POST",
      url: "/admin/admins",
      headers: { "x-admin-id": "admin", "content-type": "application/json" },
      payload: { adminId: "alice" }
    });
    assert.equal(addRes.statusCode, 200);
    assert.deepEqual(addRes.json().admins, ["admin", "alice"]);

    // The new admin is immediately usable for /admin/builds (live mutation).
    const buildsRes = await app.inject({
      method: "GET",
      url: "/admin/builds",
      headers: { "x-admin-id": "alice" }
    });
    assert.equal(buildsRes.statusCode, 200);
    await app.close();
  });

  it("POST /admin/admins is idempotent (no duplicate entries)", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin", "yky.lee"], service);
    await app.inject({
      method: "POST",
      url: "/admin/admins",
      headers: { "x-admin-id": "admin", "content-type": "application/json" },
      payload: { adminId: "yky.lee" }
    });
    const res = await app.inject({
      method: "GET",
      url: "/admin/admins",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().admins, ["admin", "yky.lee"]);
    await app.close();
  });

  it("DELETE /admin/admins/:adminId removes a non-seed admin", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin", "yky.lee"], service);
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/admins/yky.lee",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.removed, "yky.lee");
    assert.deepEqual(body.admins, ["admin"]);
    await app.close();
  });

  it("DELETE /admin/admins/:adminId refuses to remove the protected seed id", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin", "yky.lee"], service);
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/admins/admin",
      headers: { "x-admin-id": "yky.lee" }
    });
    assert.equal(res.statusCode, 409);
    await app.close();
  });

  it("DELETE /admin/admins/:adminId returns 409 for an unknown admin id", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/admins/nobody",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 409);
    await app.close();
  });
});
