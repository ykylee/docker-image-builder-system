import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  buildAcceptedResponseSchema,
  buildDuplicateResponseSchema,
  buildListQuerySchema,
  buildListResponseSchema,
  buildLogsResponseSchema,
  buildPhases,
  buildRequestSchema,
  buildStatusResponseSchema,
  claimRequestSchema,
  claimResponseSchema,
  deploymentReportRequestSchema,
  errorBody,
  notFoundBody,
  phaseUpdateRequestSchema,
  containerTestStartRequestSchema,
  containerTestResultRequestSchema,
  validationErrorBody
} from "@docker-image-builder-system/shared-contract";

import type { BuildService } from "../services/build-service.js";
import { parseContentRange } from "../repositories/build-repository.js";

// Note: Fastify v5 + zod v4 do not accept zod schemas in `routeOptions.schema`
// directly; the runtime validator (ajv) requires JSON schema with
// `required` as an array, but zod-to-json-schema emits `required` as an
// object under v4. Request validation is therefore handled inline by
// each handler via `schema.safeParse(...)`. The OpenAPI document is
// generated separately in `app/openapi.ts` from the same zod schemas
// and exposed at /openapi.json and /docs.

const buildIdParamsSchema = z.object({
  buildId: z.string().uuid()
});

export async function registerBuildRoutes(
  app: FastifyInstance,
  buildService: BuildService
): Promise<void> {
  app.get("/builds", async (request, reply) => {
    const queryResult = buildListQuerySchema.safeParse(request.query ?? {});
    if (!queryResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid list query", queryResult.error.issues)
      );
    }
    const body = await buildService.listBuilds(queryResult.data);
    return reply.status(200).send(body);
  });

  app.post("/builds", async (request, reply) => {
    const payloadResult = buildRequestSchema.safeParse(request.body ?? {});
    if (!payloadResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid build request payload", payloadResult.error.issues)
      );
    }
    const result = await buildService.createBuild(payloadResult.data);

    if ("duplicate" in result && result.duplicate) {
      const body = buildDuplicateResponseSchema.parse(result);
      return reply.status(409).send(body);
    }

    const body = buildAcceptedResponseSchema.parse(result);
    return reply.status(202).send(body);
  });

  app.get("/builds/:buildId", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    const result = await buildService.getBuild(paramsResult.data.buildId);

    if (!result) {
      return reply.status(404).send(notFoundBody("Build not found."));
    }

    const body = buildStatusResponseSchema.parse(result);
    return reply.status(200).send(body);
  });

  app.get("/builds/:buildId/logs", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    const result = await buildService.getBuildLogs(paramsResult.data.buildId);

    if (!result) {
      return reply.status(404).send(notFoundBody("Build logs not found."));
    }

    const body = buildLogsResponseSchema.parse(result);
    return reply.status(200).send(body);
  });

  app.post("/builds/claim", async (request, reply) => {
    const body = request.body ?? {};
    const payloadResult = claimRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid claim payload", payloadResult.error.issues)
      );
    }
    const payload = payloadResult.data;
    void payload.capabilities;
    // TASK-069: claim 의 canonical runnerId 를 Build Service 에 넘긴다.
    // BuildService 가 registry 의 DISABLED 여부를 검사 + successful claim
    // 시 registerRunner + markRunnerSeen 으로 누적. 빈 문자열 / 누락은
    // service 단에서 RUNNER_ID_REQUIRED reason 으로 거부된다.
    const result = await buildService.claimNextBuild(payload.runnerId);
    const validated = claimResponseSchema.parse(result);
    return reply.status(200).send(validated);
  });

  app.post("/builds/:buildId/phase", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    const body = request.body ?? {};
    const payloadResult = phaseUpdateRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid phase update payload", payloadResult.error.issues)
      );
    }
    const payload = payloadResult.data;
    if (!buildPhases.includes(payload.phase)) {
      return reply.status(400).send(
        errorBody(
          `Unknown build phase: ${payload.phase}`,
          { allowed: buildPhases }
        )
      );
    }
    const result = await buildService.reportPhase(
      paramsResult.data.buildId,
      payload.phase,
      payload.runnerId
    );
    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    if (result.kind === "invalid_transition") {
      return reply.status(409).send(
        errorBody(
          `Invalid phase transition: ${result.fromPhase} → ${result.toPhase}`,
          { fromPhase: result.fromPhase, toPhase: result.toPhase }
        )
      );
    }
    return reply.status(200).send(result.response);
  });

  // POST /builds/:buildId/container-test/start — 컨테이너 테스트 시작
  // (TASK-161 / P2-M2). 구 `POST /builds/:buildId/preview` 의 canonical 이름.
  // preview-era 의 `ttlMinutes` 는 제거됐다 — 테스트 컨테이너의 수명은
  // runner 가 결과 보고 시점에 정리하지, 호스트가 TTL 로 만료시키지 않는다.
  app.post("/builds/:buildId/container-test/start", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    const body = request.body ?? {};
    const payloadResult = containerTestStartRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid container test start payload", payloadResult.error.issues)
      );
    }
    const payload = payloadResult.data;
    const result = await buildService.startContainerTest(
      paramsResult.data.buildId,
      payload.internalPort
    );
    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    if (result.kind === "invalid_state") {
      return reply.status(409).send(
        errorBody("Build is not in a container-testable state", { reason: result.reason })
      );
    }
    return reply.status(202).send(result.response);
  });

  // POST /builds/:buildId/container-test/result — 컨테이너 테스트 결과 보고
  // (TASK-161 / P2-M2). 구 `test-deployment/ready` + `test-deployment/status`
  // 두 엔드포인트를 하나로 흡수했다. 상태는 preview-era 의
  // PROVISIONING/READY/EXPIRED 가 아니라 canonical ExecutionStatus
  // (IN_PROGRESS / SUCCESS / FAILED) 를 그대로 받는다.
  app.post("/builds/:buildId/container-test/result", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    const body = request.body ?? {};
    const payloadResult = containerTestResultRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid container test result payload", payloadResult.error.issues)
      );
    }
    const payload = payloadResult.data;
    const result = await buildService.reportContainerTestResult(
      paramsResult.data.buildId,
      payload.status,
      {
        // 계약상 nullable(=명시적 미상)이지만 저장소 계층은 optional 만
        // 받는다. null 과 미제공은 동일하게 "기존 값 유지" 로 취급한다.
        runtimeUrl: payload.runtimeUrl ?? undefined,
        host: payload.host ?? undefined,
        hostPort: payload.hostPort ?? undefined,
        containerRef: payload.containerRef,
        healthCheckPassed: payload.healthCheckPassed,
        portOpen: payload.portOpen,
        stabilityWindowPassed: payload.stabilityWindowPassed
      }
    );
    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    return reply.status(200).send(result.response);
  });

  app.post("/builds/:buildId/deployment", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    const body = request.body ?? {};
    const payloadResult = deploymentReportRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid deployment payload", payloadResult.error.issues)
      );
    }
    const result = await buildService.reportDeploymentResult(
      paramsResult.data.buildId,
      payloadResult.data
    );
    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    return reply.status(200).send(result.response);
  });

  // POST /builds/:buildId/source — upload the raw source archive bytes
  // (TASK-066). The body is a binary `application/octet-stream` payload
  // whose size and SHA-256 must match the metadata recorded on the
  // build (`BuildRequest.sourceArchive.sizeBytes` /
  // `BuildRequest.sourceArchive.checksumSha256`). The server
  // recomputes the SHA-256 from the actual bytes and refuses the
  // upload if the recomputed value disagrees with the metadata —
  // never trust the client-supplied `X-Source-Checksum-Sha256`
  // header alone.
  app.post("/builds/:buildId/source", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }

    // The metadata we need to verify the upload against is read via
    // a dedicated `getSourceArchiveMetadata` call so a 404 (no such
    // build) is reported before a 400 (bad archive) and so the
    // verified size and checksum come from the canonical build
    // record, not from caller-supplied headers.
    const metadataResult = await buildService.getSourceArchiveMetadata(
      paramsResult.data.buildId
    );
    if (metadataResult.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    const expectedSourceArchive = metadataResult.sourceArchive;

    // Fastify parses `application/octet-stream` bodies into `Buffer`
    // and exposes the raw bytes via `request.body`. Anything else
    // (e.g. JSON) is rejected with a 415-style 400 — the only
    // accepted content type for this endpoint is octet-stream.
    if (!Buffer.isBuffer(request.body)) {
      return reply.status(400).send(
        errorBody(
          "Source archive must be uploaded as application/octet-stream.",
          { receivedContentType: request.headers["content-type"] ?? null }
        )
      );
    }

    const result = await buildService.storeSourceArchive(
      paramsResult.data.buildId,
      new Uint8Array(request.body),
      expectedSourceArchive.checksumSha256,
      expectedSourceArchive.sizeBytes
    );

    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    if (result.kind === "checksum_mismatch") {
      return reply.status(400).send(
        errorBody(
          "Source archive checksum does not match the build's sourceArchive.checksumSha256 metadata.",
          { expected: result.expected, actual: result.actual }
        )
      );
    }
    if (result.kind === "size_mismatch") {
      return reply.status(400).send(
        errorBody(
          "Source archive size does not match the build's sourceArchive.sizeBytes metadata.",
          { expected: result.expected, actual: result.actual }
        )
      );
    }

    return reply.status(201).send({
      buildId: paramsResult.data.buildId,
      checksumSha256: result.checksumSha256,
      sizeBytes: result.sizeBytes
    });
  });

  // GET /builds/:buildId/source — download the raw source archive
  // bytes (TASK-066). Returns the bytes as `application/octet-stream`
  // with the SHA-256 surfaced in a response header so the Runner can
  // verify the integrity of the downloaded bytes without re-reading
  // the body. A build that exists but has no uploaded archive is
  // reported as 404 (`not_found` from the repository), distinct from
  // a build that does not exist at all (also 404 but with a
  // different message).
  app.get("/builds/:buildId/source", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }

    const result = await buildService.getSourceArchive(paramsResult.data.buildId);
    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Source archive not found for build."));
    }

    // The bytes are a Uint8Array. Buffer.from(view) is a zero-copy view
    // on the underlying ArrayBuffer so we do not duplicate the payload
    // for the wire send.
    reply.header("Content-Type", "application/octet-stream");
    reply.header("X-Source-Checksum-Sha256", result.checksumSha256);
    reply.header("X-Source-Size-Bytes", String(result.sizeBytes));
    return reply.status(200).send(Buffer.from(result.bytes));
  });

  // POST /builds/:buildId/source/chunk — chunked upload (TASK-106).
  // The Skill / tooling splits the archive into N chunks (each
  // ≤ 256 MiB Fastify bodyLimit) and posts them one at a time.
  // Each chunk's recomputed SHA-256 must match the per-chunk
  // `X-Source-Checksum-Sha256` header, and the sum of chunk
  // `sizeBytes` must equal `BuildRequest.sourceArchive.sizeBytes`
  // (recorded at `POST /builds` time). The chunk index is derived
  // by the repository from the chunks already stored for the
  // buildId — out-of-order uploads are accepted.
  //
  // Wire format: `Content-Range: bytes <start>-<end>/<total>` is
  // accepted for HTTP-standard compatibility, but the canonical
  // chunk index lives in the repository (cumulative offset). On
  // success we reply 201 + the chunk's recomputed SHA-256 +
  // `X-Chunk-Is-Final: true|false` so the caller knows when the
  // upload is complete.
  app.post("/builds/:buildId/source/chunk", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    if (!Buffer.isBuffer(request.body)) {
      return reply.status(415).send(notFoundBody("Source chunk body must be application/octet-stream."));
    }
    const metadataResult = await buildService.getSourceArchiveMetadata(
      paramsResult.data.buildId
    );
    if (metadataResult.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    const checksumHeader = request.headers["x-source-checksum-sha256"];
    const perChunkChecksumSha256 =
      typeof checksumHeader === "string" && checksumHeader.length > 0
        ? checksumHeader
        : metadataResult.sourceArchive.checksumSha256;
    // TASK-108: 의미 C bipartite — parse the RFC 7233 `Content-Range`
    // header (if present) and forward `contentRange` to the
    // repository. When the header is missing (or unparseable / out
    // of range) we deliberately fall back to the semantic-B
    // monotonic-sequence path so existing callers (no
    // `Content-Range`) keep working without change.
    const rawContentRange = request.headers["content-range"];
    const contentRangeHeader =
      typeof rawContentRange === "string" ? rawContentRange : null;
    const parsed = parseContentRange(contentRangeHeader);
    if (parsed === null && contentRangeHeader !== null) {
      // Header was supplied but unparseable — surface a 416
      // Range Not Satisfiable (RFC 7233 §4.4).
      return reply.status(416).send(
        errorBody("Content-Range header is malformed.", { header: contentRangeHeader })
      );
    }
    const contentRange = parsed?.kind === "ok" ? parsed.parts : undefined;
    if (parsed && parsed.kind === "invalid_range") {
      return reply.status(416).send(
        errorBody("Content-Range header is invalid.", { reason: parsed.reason })
      );
    }
    const result = await buildService.storeSourceChunk(
      paramsResult.data.buildId,
      new Uint8Array(request.body),
      perChunkChecksumSha256,
      metadataResult.sourceArchive.sizeBytes,
      contentRange
    );
    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    if (result.kind === "content_range_invalid") {
      return reply.status(400).send(notFoundBody("Content-Range end does not match start + bytes.length - 1."));
    }
    if (result.kind === "content_range_mismatch") {
      return reply.status(400).send(
        errorBody(
          "Content-Range total does not match the build's declared sourceArchive.sizeBytes.",
          { declared: result.declared, supplied: result.supplied }
        )
      );
    }
    if (result.kind === "checksum_mismatch") {
      return reply.status(400).send(
        errorBody(
          "Source chunk checksum mismatch.",
          { expected: result.expected, actual: result.actual }
        )
      );
    }
    if (result.kind === "size_mismatch") {
      return reply.status(400).send(
        errorBody(
          "Source chunk size mismatch.",
          { expected: result.expected, actual: result.actual }
        )
      );
    }
    if (result.kind === "idx_out_of_range") {
      return reply.status(409).send(
        errorBody(
          "Source chunk index out of range for declared total.",
          { idx: result.idx, totalChunks: result.totalChunks }
        )
      );
    }
    reply.header("X-Chunk-Is-Final", String(result.isFinalChunk));
    return reply.status(201).send({
      buildId: paramsResult.data.buildId,
      idx: result.idx,
      checksumSha256: result.checksumSha256,
      sizeBytes: result.sizeBytes
    });
  });

  // DELETE /builds/:buildId/source — drop the stored source
  // archive bytes (TASK-066). The build row (and its declared
  // `sourceArchive` metadata) is preserved so the Skill can
  // re-upload the same archive under the same buildId and the
  // Runner can re-fetch it. This is distinct from deleting the
  // build itself (which goes through the admin endpoints / future
  // build lifecycle route). 204 on success, 404 when no such
  // build or no archive present, 400 on a non-UUID buildId.
  app.delete("/builds/:buildId/source", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send(
        validationErrorBody("Invalid buildId parameter", paramsResult.error.issues)
      );
    }
    const result = await buildService.deleteSourceArchive(
      paramsResult.data.buildId
    );
    if (result.kind === "not_found") {
      return reply.status(404).send(notFoundBody("Build not found."));
    }
    return reply.status(204).send();
  });
}
