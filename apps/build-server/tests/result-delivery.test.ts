import { createHash, randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createMemoryBuildRepository } from "../src/repositories/memory-build-repository.js";
import { BuildService } from "../src/services/build-service.js";

// TASK-165 (P2-M5): webhook 결과 전달(NOTIFICATION) 검증.
// build 가 terminal(COMPLETED/FAILED)에 도달하면 build-server 가 canonical
// BuildStatusResponse 를 RESULT_WEBHOOK_URL 로 POST 하고, phase history 에
// RESULT_DELIVERY_STARTED / RESULT_DELIVERED 를 append 한다. resultDelivery
// 블록은 그 history 에서 NOTIFICATION 모드로 파생된다(별도 컬럼/마이그레이션
// 없음). 이 테스트는 실제 HTTP stub 수신서를 띄워 서버의 실제 POST 를 받는다.

type WebhookStub = {
  url: string;
  received: Array<{ path: string; body: unknown }>;
  close: () => Promise<void>;
};

async function startWebhookStub(statusCode = 200): Promise<WebhookStub> {
  const received: Array<{ path: string; body: unknown }> = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        parsed = null;
      }
      received.push({ path: req.url ?? "", body: parsed });
      res.statusCode = statusCode;
      res.end(statusCode >= 200 && statusCode < 300 ? "ok" : "err");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

async function createBuildWithSource(
  service: BuildService,
  appName: string
): Promise<string> {
  const bytes = new Uint8Array(randomBytes(64));
  const checksumSha256 = createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");
  const create = await service.createBuild({
    appName,
    requestedBy: "yklee",
    sourceArchive: {
      objectKey: `src/${appName}/archive.tar.gz`,
      checksumSha256,
      sizeBytes: bytes.byteLength
    },
    entrypointPath: "src/index.ts"
  });
  if (!("accepted" in create) || !create.accepted) {
    throw new Error(`createBuild failed: ${JSON.stringify(create)}`);
  }
  const buildId = create.build.buildId;
  const upload = await service.storeSourceArchive(
    buildId,
    bytes,
    checksumSha256,
    bytes.byteLength
  );
  if (upload.kind !== "ok") {
    throw new Error(`source upload failed: ${upload.kind}`);
  }
  return buildId;
}

describe("BuildService: webhook 결과 전달 (TASK-165 / P2-M5)", () => {
  let stub: WebhookStub;

  beforeEach(async () => {
    stub = await startWebhookStub(200);
  });
  afterEach(async () => {
    await stub.close();
  });

  it("COMPLETED 도달 시 webhook 으로 POST 하고 resultDelivery 를 NOTIFICATION/SUCCESS 로 기록", async () => {
    const service = new BuildService(createMemoryBuildRepository(), {
      strictContentRange: false,
      resultWebhookUrl: stub.url
    });
    const buildId = await createBuildWithSource(service, "webhook-ok");

    const result = await service.reportPhase(buildId, "COMPLETED", "runner-1");
    assert.equal(result.kind, "ok");

    // webhook 이 정확히 1회, 해당 build 를 payload 로 수신
    assert.equal(stub.received.length, 1);
    assert.equal(stub.received[0]!.path, "/hook");
    const body = stub.received[0]!.body as { build?: { buildId?: string } };
    assert.equal(body.build?.buildId, buildId);

    // resultDelivery 파생 + phase history append 확인
    const build = await service.getBuild(buildId);
    assert.ok(build);
    assert.equal(build!.resultDelivery?.mode, "NOTIFICATION");
    assert.equal(build!.resultDelivery?.status, "SUCCESS");
    assert.ok(build!.resultDelivery?.deliveredAt);
    const phases = build!.phaseHistory.map((e) => e.phase);
    assert.ok(phases.includes("RESULT_DELIVERY_STARTED"));
    assert.ok(phases.includes("RESULT_DELIVERED"));
    // build 자체는 여전히 COMPLETED (terminal 은 그대로)
    assert.equal(build!.build.phase, "COMPLETED");
  });

  it("terminal 을 두 번 보고해도 webhook 은 1회만 (idempotent)", async () => {
    const service = new BuildService(createMemoryBuildRepository(), {
      strictContentRange: false,
      resultWebhookUrl: stub.url
    });
    const buildId = await createBuildWithSource(service, "webhook-idem");

    await service.reportPhase(buildId, "COMPLETED", "runner-1");
    await service.reportPhase(buildId, "COMPLETED", "runner-1");

    assert.equal(stub.received.length, 1);
  });

  it("webhook 실패 시 resultDelivery 는 NOTIFICATION/FAILED, 빌드는 영향 없음", async () => {
    // 500 을 돌려주는 stub 로 교체
    await stub.close();
    stub = await startWebhookStub(500);
    const service = new BuildService(createMemoryBuildRepository(), {
      strictContentRange: false,
      resultWebhookUrl: stub.url
    });
    const buildId = await createBuildWithSource(service, "webhook-fail");

    const result = await service.reportPhase(buildId, "COMPLETED", "runner-1");
    // 전달 실패가 phase 보고를 깨지 않는다
    assert.equal(result.kind, "ok");

    const build = await service.getBuild(buildId);
    assert.ok(build);
    assert.equal(build!.resultDelivery?.mode, "NOTIFICATION");
    assert.equal(build!.resultDelivery?.status, "FAILED");
    assert.equal(build!.resultDelivery?.deliveredAt, null);
    const phases = build!.phaseHistory.map((e) => e.phase);
    assert.ok(phases.includes("RESULT_DELIVERY_STARTED"));
    assert.ok(!phases.includes("RESULT_DELIVERED"));
    assert.equal(build!.build.phase, "COMPLETED");
  });

  it("webhook 미설정 시 결과 전달은 POLLING 유지 (RESULT_DELIVERY phase 없음)", async () => {
    const service = new BuildService(createMemoryBuildRepository(), {
      strictContentRange: false
      // resultWebhookUrl 미설정
    });
    const buildId = await createBuildWithSource(service, "webhook-none");

    await service.reportPhase(buildId, "COMPLETED", "runner-1");
    assert.equal(stub.received.length, 0);

    const build = await service.getBuild(buildId);
    assert.ok(build);
    assert.equal(build!.resultDelivery?.mode, "POLLING");
    const phases = build!.phaseHistory.map((e) => e.phase);
    assert.ok(!phases.includes("RESULT_DELIVERY_STARTED"));
    assert.ok(!phases.includes("RESULT_DELIVERED"));
  });
});
