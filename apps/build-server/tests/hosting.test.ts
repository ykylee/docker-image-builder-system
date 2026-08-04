import { createHash, randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { BuildService } from "../src/services/build-service.js";
import type { K8sAdmin } from "../src/services/k8s-admin.js";
import {
  normalizeContextPath,
  validateContextPath,
  RESERVED_CONTEXT_PATHS
} from "../src/services/context-path.js";

// TASK-166 (P3-M1): 호스팅 context-path 할당 + registry.

describe("context-path 정규화/검증", () => {
  it("normalizeContextPath — URL-safe 정규화", () => {
    assert.equal(normalizeContextPath("Todo App"), "todo-app");
    assert.equal(normalizeContextPath("  My_APP.v2  "), "my-app-v2");
    assert.equal(normalizeContextPath("--a--b--"), "a-b");
    assert.equal(normalizeContextPath("!!!"), "");
    assert.equal(normalizeContextPath("a".repeat(80)).length, 63);
  });

  it("validateContextPath — 예약어/빈값 거부", () => {
    for (const reserved of RESERVED_CONTEXT_PATHS) {
      const r = validateContextPath(reserved);
      assert.equal(r.ok, false, `${reserved} 는 예약어여야 함`);
    }
    assert.equal(validateContextPath("!!!").ok, false); // 정규화 후 빈값
    const ok = validateContextPath("My Cool App");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.contextPath, "my-cool-app");
  });
});

describe("호스팅 registry (memory)", () => {
  it("upsert / getByApp / getByContextPath / list / delete", async () => {
    const repo = createMemoryBuildRepository();
    const svc = {
      appName: "app-a",
      contextPath: "app-a",
      namespace: "dib-hosted",
      deploymentName: "dib-app-a",
      containerPort: 8080,
      stripPrefix: true,
      status: "RUNNING",
      url: "http://h/app-a/",
      currentBuildId: null,
      imageRef: "img:1"
    };
    const created = await repo.upsertHostedService(svc);
    assert.equal(created.appName, "app-a");
    assert.equal(created.status, "RUNNING");

    assert.ok(await repo.getHostedServiceByAppName("app-a"));
    assert.ok(await repo.getHostedServiceByContextPath("app-a"));
    assert.equal(await repo.getHostedServiceByAppName("nope"), null);

    // 같은 app upsert = 교체(1개 유지)
    await repo.upsertHostedService({ ...svc, status: "STOPPED" });
    const list = await repo.listHostedServices();
    assert.equal(list.length, 1);
    assert.equal(list[0]!.status, "STOPPED");

    assert.equal(await repo.deleteHostedService("app-a"), true);
    assert.equal((await repo.listHostedServices()).length, 0);
    assert.equal(await repo.deleteHostedService("app-a"), false);
  });
});

async function createBuild(
  svc: BuildService,
  appName: string,
  contextPath?: string
) {
  const bytes = new Uint8Array(randomBytes(32));
  const checksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  return svc.createBuild({
    appName,
    requestedBy: "yklee",
    sourceArchive: {
      objectKey: `k/${appName}`,
      checksumSha256: checksum,
      sizeBytes: bytes.byteLength
    },
    entrypointPath: "src/index.ts",
    dockerfilePath: "Dockerfile",
    runtimePort: 8080,
    metadata: {},
    ...(contextPath ? { contextPath } : {})
  });
}

describe("createBuild — context-path 할당", () => {
  it("미지정 시 appName 파생, 명시 시 정규화", async () => {
    const svc = new BuildService(createMemoryBuildRepository());
    const a = await createBuild(svc, "Todo App");
    assert.equal(a.kind, "accepted");
  });

  it("예약어 context-path 는 거부", async () => {
    const svc = new BuildService(createMemoryBuildRepository());
    const r = await createBuild(svc, "some-app", "admin");
    assert.equal(r.kind, "context_path_invalid");
  });

  it("다른 앱이 점유한 context-path 는 CONTEXT_PATH_TAKEN", async () => {
    const repo = createMemoryBuildRepository();
    // app-a 가 이미 'shared' 를 호스팅 중
    await repo.upsertHostedService({
      appName: "app-a",
      contextPath: "shared",
      namespace: "dib-hosted",
      deploymentName: "dib-shared",
      containerPort: 8080,
      stripPrefix: true,
      status: "RUNNING",
      url: null,
      currentBuildId: null,
      imageRef: null
    });
    const svc = new BuildService(repo);

    // app-b 가 같은 context-path 요청 → 거부
    const taken = await createBuild(svc, "app-b", "shared");
    assert.equal(taken.kind, "context_path_taken");

    // app-a 는 같은 context-path 재사용 가능(교체)
    const same = await createBuild(svc, "app-a", "shared");
    assert.equal(same.kind, "accepted");
  });

  it("다른 앱의 진행 중 build가 점유한 context-path도 차단한다", async () => {
    const repo = createMemoryBuildRepository();
    const svc = new BuildService(repo);
    const first = await createBuild(svc, "app-a", "shared-active");
    assert.equal(first.kind, "accepted");

    const second = await createBuild(svc, "app-b", "shared-active");
    assert.deepEqual(second, {
      kind: "context_path_taken",
      contextPath: "shared-active",
      appName: "app-a"
    });
  });
});

describe("배포 성공 보고 → HostedService upsert (TASK-167 / P3-M2)", () => {
  it("HOSTING_BASE_HOST 설정 + contextPath 보고 시 upsert + url 조립", async () => {
    const repo = createMemoryBuildRepository();
    const svc = new BuildService(repo, {
      strictContentRange: false,
      hostingBaseHost: "apps.example.com"
    });
    const created = await createBuild(svc, "todo-app");
    assert.equal(created.kind, "accepted");
    const buildId =
      created.kind === "accepted" ? created.response.build.buildId : "";

    const outcome = await svc.reportDeploymentResult(buildId, {
      status: "SUCCESS",
      targetType: "K8S",
      contextPath: "todo-app",
      namespace: "dib-hosted",
      deploymentName: "dib-todo-app",
      resultRef: "deployment/dib-todo-app",
      runnerId: "r-1"
    });
    assert.equal(outcome.kind, "ok");

    const hosted = await svc.getHostedService("todo-app");
    assert.ok(hosted, "HostedService 가 upsert 돼야 함");
    assert.equal(hosted!.status, "RUNNING");
    assert.equal(hosted!.contextPath, "todo-app");
    assert.equal(hosted!.url, "http://apps.example.com/todo-app/");
    assert.equal(hosted!.currentBuildId, buildId);
    assert.equal(hosted!.containerPort, 8080);
  });

  it("stripPrefix=false 빌드는 HostedService 에 그대로 반영 (TASK-169)", async () => {
    const repo = createMemoryBuildRepository();
    const svc = new BuildService(repo, {
      strictContentRange: false,
      hostingBaseHost: "apps.example.com"
    });
    const bytes = new Uint8Array(randomBytes(16));
    const checksum = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex");
    const created = await svc.createBuild({
      appName: "next-app",
      requestedBy: "yklee",
      sourceArchive: { objectKey: "k", checksumSha256: checksum, sizeBytes: bytes.byteLength },
      entrypointPath: "src/index.ts",
      dockerfilePath: "Dockerfile",
      stripPrefix: false,
      metadata: {}
    });
    const buildId = created.kind === "accepted" ? created.response.build.buildId : "";

    await svc.reportDeploymentResult(buildId, {
      status: "SUCCESS",
      targetType: "K8S",
      contextPath: "next-app",
      runnerId: "r-1"
    });
    const hosted = await svc.getHostedService("next-app");
    assert.equal(hosted!.stripPrefix, false);
  });

  it("hostingScheme=subdomain 은 url 을 <cp>.<host>/ 로 조립 (TASK-172)", async () => {
    const repo = createMemoryBuildRepository();
    const svc = new BuildService(repo, {
      strictContentRange: false,
      hostingBaseHost: "apps.example.com"
    });
    const bytes = new Uint8Array(randomBytes(16));
    const checksum = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex");
    const created = await svc.createBuild({
      appName: "spa-app",
      requestedBy: "yklee",
      sourceArchive: { objectKey: "k", checksumSha256: checksum, sizeBytes: bytes.byteLength },
      entrypointPath: "src/index.ts",
      dockerfilePath: "Dockerfile",
      hostingScheme: "subdomain",
      metadata: {}
    });
    const buildId = created.kind === "accepted" ? created.response.build.buildId : "";

    await svc.reportDeploymentResult(buildId, {
      status: "SUCCESS",
      targetType: "K8S",
      contextPath: "spa-app",
      runnerId: "r-1"
    });
    const hosted = await svc.getHostedService("spa-app");
    assert.equal(hosted!.hostingScheme, "subdomain");
    assert.equal(hosted!.url, "http://spa-app.apps.example.com/");
  });

  it("HOSTING_BASE_HOST 미설정 시 upsert 안 함(호스팅 비활성)", async () => {
    const repo = createMemoryBuildRepository();
    const svc = new BuildService(repo, { strictContentRange: false });
    const created = await createBuild(svc, "todo-app-2");
    const buildId =
      created.kind === "accepted" ? created.response.build.buildId : "";

    await svc.reportDeploymentResult(buildId, {
      status: "SUCCESS",
      targetType: "K8S",
      contextPath: "todo-app-2",
      runnerId: "r-1"
    });

    assert.equal((await svc.listHostedServices()).length, 0);
  });
});

function fakeK8sAdmin() {
  const calls: Array<{ op: string; ns: string; name: string; replicas?: number }> = [];
  const admin: K8sAdmin & {
    calls: typeof calls;
    failNext?: boolean;
    // TASK-174: availableReplicas 제어 — 반환값 override + name 기준 예외 발생.
    replicas?: number;
    failReplicasFor?: Set<string>;
  } = {
    calls,
    async scale(ns, name, replicas) {
      if (admin.failNext) throw new Error("kubectl boom");
      calls.push({ op: "scale", ns, name, replicas });
    },
    async remove(ns, name) {
      if (admin.failNext) throw new Error("kubectl boom");
      calls.push({ op: "remove", ns, name });
    },
    async availableReplicas(ns, name) {
      calls.push({ op: "availableReplicas", ns, name });
      if (admin.failReplicasFor?.has(name)) {
        throw new Error("kubectl get boom");
      }
      return admin.replicas ?? 1;
    }
  };
  return admin;
}

async function seedHosted(repo: ReturnType<typeof createMemoryBuildRepository>) {
  await repo.upsertHostedService({
    appName: "app-x",
    contextPath: "app-x",
    namespace: "dib-hosted",
    deploymentName: "dib-app-x",
    containerPort: 8080,
    stripPrefix: true,
    status: "RUNNING",
    url: "http://h/app-x/",
    currentBuildId: null,
    imageRef: null
  });
}

describe("호스팅 관리 라이프사이클 (TASK-168 / P3-M3)", () => {
  it("stop → scale 0 + STOPPED / start → scale 1 + RUNNING", async () => {
    const repo = createMemoryBuildRepository();
    await seedHosted(repo);
    const admin = fakeK8sAdmin();
    const svc = new BuildService(repo, { strictContentRange: false }, admin);

    const stopped = await svc.stopHostedService("app-x");
    assert.equal(stopped.kind, "ok");
    if (stopped.kind === "ok") assert.equal(stopped.service.status, "STOPPED");
    assert.deepEqual(admin.calls.at(-1), {
      op: "scale",
      ns: "dib-hosted",
      name: "dib-app-x",
      replicas: 0
    });

    const started = await svc.startHostedService("app-x");
    assert.equal(started.kind, "ok");
    if (started.kind === "ok") assert.equal(started.service.status, "RUNNING");
    assert.equal(admin.calls.at(-1)!.replicas, 1);
  });

  it("remove → kubectl delete + registry 제거(contextPath 반환)", async () => {
    const repo = createMemoryBuildRepository();
    await seedHosted(repo);
    const admin = fakeK8sAdmin();
    const svc = new BuildService(repo, { strictContentRange: false }, admin);

    const removed = await svc.removeHostedService("app-x");
    assert.equal(removed.kind, "ok");
    if (removed.kind === "ok") assert.equal(removed.service.status, "REMOVED");
    assert.equal(admin.calls.at(-1)!.op, "remove");
    assert.equal(await svc.getHostedService("app-x"), null);
    // context path 반환 확인 — 다른 앱이 app-x 를 다시 쓸 수 있다
    const other = await createBuild(svc, "other-app", "app-x");
    assert.equal(other.kind, "accepted");
  });

  it("없는 앱 → not_found / k8s 실패 → k8s_error(registry 불변)", async () => {
    const repo = createMemoryBuildRepository();
    await seedHosted(repo);
    const admin = fakeK8sAdmin();
    const svc = new BuildService(repo, { strictContentRange: false }, admin);

    assert.equal((await svc.stopHostedService("nope")).kind, "not_found");

    admin.failNext = true;
    const err = await svc.stopHostedService("app-x");
    assert.equal(err.kind, "k8s_error");
    // k8s 실패 시 registry status 는 그대로 RUNNING
    const still = await svc.getHostedService("app-x");
    assert.equal(still!.status, "RUNNING");
  });
});

async function seedNamed(
  repo: ReturnType<typeof createMemoryBuildRepository>,
  appName: string,
  status = "RUNNING"
) {
  await repo.upsertHostedService({
    appName,
    contextPath: appName,
    namespace: "dib-hosted",
    deploymentName: `dib-${appName}`,
    containerPort: 8080,
    stripPrefix: true,
    hostingScheme: "path",
    status,
    url: `http://h/${appName}/`,
    currentBuildId: null,
    imageRef: null
  });
}

describe("호스팅 status 캐시 (TASK-174 / v0.7.0)", () => {
  it("upsert 직후 live 캐시는 null (미sync)", async () => {
    const repo = createMemoryBuildRepository();
    await seedNamed(repo, "app-x");
    const svc = await repo.getHostedServiceByAppName("app-x");
    assert.equal(svc!.availableReplicas, null);
    assert.equal(svc!.lastSyncedAt, null);
  });

  it("updateHostedServiceLiveStatus — live 필드만 갱신, desired status 불변", async () => {
    const repo = createMemoryBuildRepository();
    await seedNamed(repo, "app-x", "STOPPED");
    const before = await repo.getHostedServiceByAppName("app-x");

    const updated = await repo.updateHostedServiceLiveStatus("app-x", 3);
    assert.equal(updated!.availableReplicas, 3);
    assert.ok(updated!.lastSyncedAt);
    // desired lifecycle status / updatedAt 은 건드리지 않는다.
    assert.equal(updated!.status, "STOPPED");
    assert.equal(updated!.updatedAt, before!.updatedAt);

    assert.equal(await repo.updateHostedServiceLiveStatus("nope", 1), null);
  });

  it("syncHostedServiceStatuses — 실측 replica 를 전 서비스에 캐시", async () => {
    const repo = createMemoryBuildRepository();
    await seedNamed(repo, "app-a");
    await seedNamed(repo, "app-b");
    const admin = fakeK8sAdmin();
    admin.replicas = 2;
    const svc = new BuildService(repo, { strictContentRange: false }, admin);

    const result = await svc.syncHostedServiceStatuses();
    assert.deepEqual(result, { synced: 2, failed: 0 });

    const a = await repo.getHostedServiceByAppName("app-a");
    const b = await repo.getHostedServiceByAppName("app-b");
    assert.equal(a!.availableReplicas, 2);
    assert.equal(b!.availableReplicas, 2);
    assert.ok(a!.lastSyncedAt);
  });

  it("REMOVED 는 sync 대상에서 제외", async () => {
    const repo = createMemoryBuildRepository();
    await seedNamed(repo, "gone", "REMOVED");
    await seedNamed(repo, "live");
    const admin = fakeK8sAdmin();
    const svc = new BuildService(repo, { strictContentRange: false }, admin);

    const result = await svc.syncHostedServiceStatuses();
    assert.deepEqual(result, { synced: 1, failed: 0 });
    // REMOVED 서비스에는 availableReplicas 조회조차 하지 않는다.
    assert.equal(
      admin.calls.some((c) => c.op === "availableReplicas" && c.name === "dib-gone"),
      false
    );
  });

  it("개별 서비스 k8s 조회 실패는 격리 — 나머지는 계속 sync", async () => {
    const repo = createMemoryBuildRepository();
    await seedNamed(repo, "app-ok");
    await seedNamed(repo, "app-bad");
    const admin = fakeK8sAdmin();
    admin.replicas = 1;
    admin.failReplicasFor = new Set(["dib-app-bad"]);
    const svc = new BuildService(repo, { strictContentRange: false }, admin);

    const result = await svc.syncHostedServiceStatuses();
    assert.deepEqual(result, { synced: 1, failed: 1 });

    const ok = await repo.getHostedServiceByAppName("app-ok");
    const bad = await repo.getHostedServiceByAppName("app-bad");
    assert.equal(ok!.availableReplicas, 1);
    // 실패한 서비스는 캐시가 stale(=null 유지).
    assert.equal(bad!.availableReplicas, null);
  });

  it("재배포(upsert) 시 live 캐시 무효화", async () => {
    const repo = createMemoryBuildRepository();
    await seedNamed(repo, "app-x");
    await repo.updateHostedServiceLiveStatus("app-x", 4);
    assert.equal((await repo.getHostedServiceByAppName("app-x"))!.availableReplicas, 4);

    // 같은 app 재배포 → 이전 replica 캐시는 무효(null)로 리셋.
    await seedNamed(repo, "app-x");
    const svc = await repo.getHostedServiceByAppName("app-x");
    assert.equal(svc!.availableReplicas, null);
    assert.equal(svc!.lastSyncedAt, null);
  });
});
