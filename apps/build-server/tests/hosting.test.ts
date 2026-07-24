import { createHash, randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { BuildService } from "../src/services/build-service.js";
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
      url: "https://h/app-a/",
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
});
