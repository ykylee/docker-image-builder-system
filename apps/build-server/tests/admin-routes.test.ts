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
  service: BuildService,
  options: { legacyHeadersEnabled?: boolean } = {}
): Promise<FastifyInstance> {
  const previous = process.env.AUTH_LEGACY_HEADERS;
  // 기본값은 legacy ON — 기존 admin-routes 테스트가 X-Admin-Id 헤더로 admin 을
  // 호출하는 시나리오가 많아 default 를 legacy ON 으로 둔다. legacy OFF 의
  // silent reject 검증은 admin-routes-prehandler.test.ts 신규 가드에서 처리.
  const legacyEnabled = options.legacyHeadersEnabled ?? true;
  if (legacyEnabled) {
    process.env.AUTH_LEGACY_HEADERS = "true";
  } else {
    delete process.env.AUTH_LEGACY_HEADERS;
  }
  try {
    const app = Fastify({ logger: false });
    await registerAdminRoutes(app, service, createAdminAllowList(adminIds));
    return app;
  } finally {
    if (previous === undefined) {
      delete process.env.AUTH_LEGACY_HEADERS;
    } else {
      process.env.AUTH_LEGACY_HEADERS = previous;
    }
  }
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

describe("GET /admin/hosting-capacity", () => {
  it("returns capacity usage for an admin caller", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({
      method: "GET",
      url: "/admin/hosting-capacity",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.capacity.cpuMillicores, 2000);
    assert.equal(body.used.cpuMillicores, 0);
    assert.equal(body.remaining.memoryMi, 5632);
    assert.equal(body.tiers.standard.maxServices, 8);
    await app.close();
  });

  it("keeps capacity usage admin-only", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({ method: "GET", url: "/admin/hosting-capacity" });
    assert.equal(res.statusCode, 401);
    await app.close();
  });
});

describe("service manifest management", () => {
  const manifest = (tag: string) => ({
    version: 1 as const,
    service: { appName: "manifest-app", image: { repository: "registry/manifest-app", tag } },
    runtime: { port: 8080, command: "npm start", healthPath: "/health", basePathEnv: "APP_BASE_PATH" },
    hosting: { scheme: "path" as const, contextPath: "manifest-app", stripPrefix: true, tier: "sandbox" as const, replicas: 1 },
    database: { enabled: true, engine: "postgres" as const, migrationCommand: "npm run db:migrate" },
    deployment: { adapter: "helm" as const, namespace: "dib-hosted" }
  });

  it("stores, reads, and lists immutable manifest revisions", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);

    const first = await app.inject({
      method: "PUT",
      url: "/admin/hosted-services/manifest-app/manifest",
      headers: { "x-admin-id": "admin" },
      payload: manifest("build-1")
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().currentRevision, 1);

    const second = await app.inject({
      method: "PUT",
      url: "/admin/hosted-services/manifest-app/manifest",
      headers: { "x-admin-id": "admin" },
      payload: manifest("build-2")
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().currentRevision, 2);

    const current = await app.inject({
      method: "GET",
      url: "/admin/hosted-services/manifest-app/manifest",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(current.statusCode, 200);
    assert.equal(current.json().manifest.service.image.tag, "build-2");

    const revisions = await app.inject({
      method: "GET",
      url: "/admin/hosted-services/manifest-app/manifest/revisions",
      headers: { "x-admin-id": "admin" }
    });
    assert.equal(revisions.statusCode, 200);
    assert.deepEqual(revisions.json().revisions.map((r: { revision: number }) => r.revision), [2, 1]);
    await app.close();
  });

  it("rejects manifest updates from non-admin callers", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({
      method: "PUT",
      url: "/admin/hosted-services/manifest-app/manifest",
      headers: { "x-admin-id": "alice" },
      payload: manifest("build-1")
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });

  it("rejects caller-owned database connection fields", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const response = await app.inject({
      method: "PUT",
      url: "/admin/hosted-services/manifest-app/manifest",
      headers: { "x-admin-id": "admin" },
      payload: {
        ...manifest("build-1"),
        database: { enabled: true, host: "host.docker.internal", password: "secret" }
      }
    });

    assert.equal(response.statusCode, 400);
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

describe("createAdminAllowList seed validation (TASK-049 follow-up)", () => {
  it("throws on empty seed", () => {
    assert.throws(
      () => createAdminAllowList([]),
      /at least one admin id/
    );
  });

  it("throws on seed with non-conforming id (whitespace)", () => {
    assert.throws(
      () => createAdminAllowList(["admin", "  yky.lee  "]),
      /fails the admin id pattern/
    );
  });

  it("throws on seed with non-conforming id (path-like)", () => {
    assert.throws(
      () => createAdminAllowList(["admin/../etc"]),
      /fails the admin id pattern/
    );
  });

  it("accepts letters, digits, dot, underscore, hyphen", () => {
    const list = createAdminAllowList(["admin", "yky.lee", "user_1", "team-a"]);
    assert.deepEqual(list.list(), ["admin", "yky.lee", "user_1", "team-a"]);
  });
});

describe("admin add/remove with charset validation (TASK-049 follow-up)", () => {
  it("POST /admin/admins rejects adminId that fails the pattern", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin"], service);
    const res = await app.inject({
      method: "POST",
      url: "/admin/admins",
      headers: { "x-admin-id": "admin", "content-type": "application/json" },
      payload: { adminId: "  bad id  " }
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it("add() helper throws on a non-conforming id (in-process mutation)", () => {
    const list = createAdminAllowList(["admin"]);
    assert.throws(() => list.add("a/b"), /fails the admin id pattern/);
    assert.throws(() => list.add(""), /fails the admin id pattern/);
  });

  it("DELETE /admin/admins/:adminId returns 400 for non-conforming target", async () => {
    const service = new BuildService(createMemoryBuildRepository());
    const app = await buildAppWithService(["admin", "yky.lee"], service);
    const res = await app.inject({
      method: "DELETE",
      url: "/admin/admins/bad%20id",
      headers: { "x-admin-id": "admin" }
    });
    // Path param 이 "bad id" 로 decode. 정규식 위반.
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

// (empty — keep file well-formed; the admin-routes.test.ts is a different file though,
//  phase tests live in build-routes.test.ts or new file)
