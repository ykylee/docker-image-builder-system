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
  phaseUpdateRequestSchema
} from "@docker-image-builder-system/shared-contract";

import type { BuildService } from "../services/build-service.js";

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
}
