import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { getOpenApiDocument } from "../src/app/openapi.js";

describe("openapi document", () => {
  it("builds a document with the expected tags, paths, and components", () => {
    const document = getOpenApiDocument() as {
      openapi: string;
      info: { title: string; version: string };
      tags: { name: string; description: string }[];
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    assert.equal(document.openapi, "3.0.3");
    assert.equal(document.info.title, "Docker Image Builder — Build Server API");
    assert.equal(document.info.version, "0.1.0");

    const tagNames = document.tags.map((t) => t.name).sort();
    assert.deepEqual(tagNames, [
      "Admin",
      "Builds",
      "Health",
      "Runner Claim",
      "Test Deployment"
    ]);

    // PKG-001~PKG-006 의 9개 Build 경로 + /health + GET /builds (list) = 10
    // unique path keys. 같은 path (/builds) 에 GET + POST 가 merge 됨.
    const pathKeys = Object.keys(document.paths).sort();
    assert.deepEqual(pathKeys, [
      "/admin/builds",
      "/admin/users",
      "/builds",
      "/builds/claim",
      "/builds/{buildId}",
      "/builds/{buildId}/logs",
      "/builds/{buildId}/phase",
      "/builds/{buildId}/preview",
      "/builds/{buildId}/test-deployment",
      "/builds/{buildId}/test-deployment/ready",
      "/builds/{buildId}/test-deployment/status",
      "/health"
    ]);

    // /builds 는 GET (list) + POST (create) 두 method 를 가져야 함
    const buildsMethods = Object.keys(document.paths["/builds"] ?? {}).sort();
    assert.deepEqual(buildsMethods, ["get", "post"]);

    // 15 component schemas (BuildLogEntry 와 BuildSummary 는 zod parse 의
    // 응답 envelope 안에서 자동 emit 됨). 마지막 PR 에서 변동 가능.
    const schemaKeys = Object.keys(document.components.schemas).sort();
    assert.ok(
      schemaKeys.includes("BuildRequest"),
      "BuildRequest schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("ClaimRequest"),
      "ClaimRequest schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("TestDeployment"),
      "TestDeployment schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("AdminListBuildsQuery"),
      "AdminListBuildsQuery schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("AdminListBuildsResponse"),
      "AdminListBuildsResponse schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("AdminUserBuildSummary"),
      "AdminUserBuildSummary schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("AdminUserListResponse"),
      "AdminUserListResponse schema must be registered"
    );
  });
});
