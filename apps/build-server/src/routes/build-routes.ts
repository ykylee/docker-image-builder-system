import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  buildAcceptedResponseSchema,
  buildDuplicateResponseSchema,
  buildLogsResponseSchema,
  buildPhases,
  buildRequestSchema,
  buildStatusResponseSchema,
  claimRequestSchema,
  claimResponseSchema,
  phaseUpdateRequestSchema,
  testDeploymentQueueRequestSchema,
  testDeploymentQueueResponseSchema,
  testDeploymentReadyRequestSchema,
  testDeploymentStatusRequestSchema
} from "@docker-image-builder-system/shared-contract";

import type { BuildService } from "../services/build-service.js";

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
  app.post("/builds", async (request, reply) => {
    const payload = buildRequestSchema.parse(request.body);
    const result = await buildService.createBuild(payload);

    if ("duplicate" in result && result.duplicate) {
      const body = buildDuplicateResponseSchema.parse(result);
      return reply.status(409).send(body);
    }

    const body = buildAcceptedResponseSchema.parse(result);
    return reply.status(202).send(body);
  });

  app.get("/builds/:buildId", async (request, reply) => {
    const params = buildIdParamsSchema.parse(request.params);
    const result = await buildService.getBuild(params.buildId);

    if (!result) {
      return reply.status(404).send({
        message: "Build not found."
      });
    }

    const body = buildStatusResponseSchema.parse(result);
    return reply.status(200).send(body);
  });

  app.get("/builds/:buildId/logs", async (request, reply) => {
    const params = buildIdParamsSchema.parse(request.params);
    const result = await buildService.getBuildLogs(params.buildId);

    if (!result) {
      return reply.status(404).send({
        message: "Build logs not found."
      });
    }

    const body = buildLogsResponseSchema.parse(result);
    return reply.status(200).send(body);
  });

  app.post("/builds/claim", async (request, reply) => {
    const body = request.body ?? {};
    const payloadResult = claimRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send({
        message: "Invalid claim payload",
        issues: payloadResult.error.issues
      });
    }
    const payload = payloadResult.data;
    void payload.capabilities;
    const result = await buildService.claimNextBuild();
    const validated = claimResponseSchema.parse(result);
    return reply.status(200).send(validated);
  });

  app.post("/builds/:buildId/phase", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        message: "Invalid buildId parameter",
        issues: paramsResult.error.issues
      });
    }
    const body = request.body ?? {};
    const payloadResult = phaseUpdateRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send({
        message: "Invalid phase update payload",
        issues: payloadResult.error.issues
      });
    }
    const payload = payloadResult.data;
    if (!buildPhases.includes(payload.phase)) {
      return reply.status(400).send({
        message: `Unknown build phase: ${payload.phase}`,
        allowed: buildPhases
      });
    }
    const result = await buildService.reportPhase(paramsResult.data.buildId, payload.phase);
    if (result.kind === "not_found") {
      return reply.status(404).send({
        message: "Build not found."
      });
    }
    if (result.kind === "invalid_transition") {
      return reply.status(409).send({
        message: `Invalid phase transition: ${result.fromPhase} → ${result.toPhase}`,
        fromPhase: result.fromPhase,
        toPhase: result.toPhase
      });
    }
    return reply.status(200).send(result.response);
  });

  // POST /builds/:buildId/preview - queue a test deployment
  app.post("/builds/:buildId/preview", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        message: "Invalid buildId parameter",
        issues: paramsResult.error.issues
      });
    }
    const body = request.body ?? {};
    const payloadResult = testDeploymentQueueRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send({
        message: "Invalid preview queue payload",
        issues: payloadResult.error.issues
      });
    }
    const payload = payloadResult.data;
    const result = await buildService.queueTestDeployment(
      paramsResult.data.buildId,
      payload.internalPort,
      payload.ttlMinutes
    );
    if (result.kind === "not_found") {
      return reply.status(404).send({ message: "Build not found." });
    }
    if (result.kind === "invalid_state") {
      return reply.status(409).send({
        message: "Build is not in a queueable state",
        reason: result.reason
      });
    }
    const body2 = testDeploymentQueueResponseSchema.parse(result.response);
    return reply.status(202).send(body2);
  });

  // POST /builds/:buildId/test-deployment/ready - report preview ready
  app.post("/builds/:buildId/test-deployment/ready", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        message: "Invalid buildId parameter",
        issues: paramsResult.error.issues
      });
    }
    const body = request.body ?? {};
    const payloadResult = testDeploymentReadyRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send({
        message: "Invalid preview ready payload",
        issues: payloadResult.error.issues
      });
    }
    const payload = payloadResult.data;
    const result = await buildService.reportPreviewStatus(
      paramsResult.data.buildId,
      "READY",
      {
        previewUrl: payload.previewUrl,
        host: payload.host,
        hostPort: payload.hostPort
      }
    );
    if (result.kind === "not_found") {
      return reply.status(404).send({ message: "Build not found." });
    }
    return reply.status(200).send(result.response);
  });

  // POST /builds/:buildId/test-deployment/status - report general preview status (PROVISIONING/FAILED/EXPIRED)
  app.post("/builds/:buildId/test-deployment/status", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        message: "Invalid buildId parameter",
        issues: paramsResult.error.issues
      });
    }
    const body = request.body ?? {};
    const payloadResult = testDeploymentStatusRequestSchema.safeParse(body);
    if (!payloadResult.success) {
      return reply.status(400).send({
        message: "Invalid preview status payload",
        issues: payloadResult.error.issues
      });
    }
    const payload = payloadResult.data;
    const result = await buildService.reportPreviewStatus(
      paramsResult.data.buildId,
      payload.status
    );
    if (result.kind === "not_found") {
      return reply.status(404).send({ message: "Build not found." });
    }
    return reply.status(200).send(result.response);
  });

  // GET /builds/:buildId/test-deployment - read current test deployment
  app.get("/builds/:buildId/test-deployment", async (request, reply) => {
    const paramsResult = buildIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        message: "Invalid buildId parameter",
        issues: paramsResult.error.issues
      });
    }
    const result = await buildService.getTestDeployment(paramsResult.data.buildId);
    if (result.kind === "not_found") {
      return reply.status(404).send({ message: "Build not found." });
    }
    if (result.kind === "not_requested") {
      return reply.status(404).send({ message: "Test deployment not requested." });
    }
    return reply.status(200).send({ testDeployment: result.testDeployment });
  });
}
