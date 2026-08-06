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
      "Container Test",
      "Deployment",
      "Health",
      "Runner Claim"
    ]);

    // unique path keys. 같은 path (/builds) 에 GET + POST 가 merge 됨.
    // TASK-069: /admin/runners + /admin/runners/{runnerId} 가 추가되어
    // unique path key 가 16개 (이전 14 + 2).
    const pathKeys = Object.keys(document.paths).sort();
    assert.deepEqual(pathKeys, [
      "/admin/builds",
      "/admin/hosted-services/{appName}/database",
      "/admin/hosted-services/{appName}/database/purge",
      "/admin/hosted-services/{appName}/database/rotate",
      "/admin/hosted-services/{appName}/manifest",
      "/admin/hosted-services/{appName}/manifest/revisions",
      "/admin/hosting-capacity",
      "/admin/runners",
      "/admin/runners/{runnerId}",
      "/admin/users",
      "/builds",
      "/builds/claim",
      "/builds/{buildId}",
      "/builds/{buildId}/container-test/result",
      "/builds/{buildId}/container-test/start",
      "/builds/{buildId}/deployment",
      "/builds/{buildId}/logs",
      "/builds/{buildId}/phase",
      "/builds/{buildId}/source",
      "/health"
      , "/services"
    ]);

    // /builds 는 GET (list) + POST (create) 두 method 를 가져야 함
    const buildsMethods = Object.keys(document.paths["/builds"] ?? {}).sort();
    assert.deepEqual(buildsMethods, ["get", "post"]);

    // 20 component schemas (BuildLogEntry 와 BuildSummary 는 zod parse 의
    // 응답 envelope 안에서 자동 emit 됨). 마지막 PR 에서 변동 가능.
    // TASK-069: AdminRunner / AdminRunnerListResponse / PATCH-REQ / PATCH-RESP / DELETE-RESP 추가.
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
      schemaKeys.includes("ContainerTestStartRequest"),
      "ContainerTestStartRequest schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("ContainerTestResultRequest"),
      "ContainerTestResultRequest schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("DeploymentReportRequest"),
      "DeploymentReportRequest schema must be registered"
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
    assert.ok(
      schemaKeys.includes("HostingCapacityResponse"),
      "HostingCapacityResponse schema must be registered"
    );
    assert.ok(schemaKeys.includes("ServiceManifest"), "ServiceManifest schema must be registered");
    assert.ok(schemaKeys.includes("ServiceManifestResponse"), "ServiceManifestResponse schema must be registered");
    assert.ok(
      schemaKeys.includes("ServiceManifestRevisionListResponse"),
      "ServiceManifestRevisionListResponse schema must be registered"
    );
    assert.ok(
      schemaKeys.includes("AdminRunner"),
      "AdminRunner schema must be registered (TASK-069)"
    );
    assert.ok(
      schemaKeys.includes("AdminRunnerListResponse"),
      "AdminRunnerListResponse schema must be registered (TASK-069)"
    );
    assert.ok(
      schemaKeys.includes("AdminRunnerPatchRequest"),
      "AdminRunnerPatchRequest schema must be registered (TASK-069)"
    );
    assert.ok(
      schemaKeys.includes("AdminRunnerPatchResponse"),
      "AdminRunnerPatchResponse schema must be registered (TASK-069)"
    );
    assert.ok(
      schemaKeys.includes("AdminRunnerDeleteResponse"),
      "AdminRunnerDeleteResponse schema must be registered (TASK-069)"
    );
  });
});
