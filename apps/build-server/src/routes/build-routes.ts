import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  getBuildLogsResponseSchema,
  getBuildResponseSchema,
  postBuildAcceptedResponseSchema,
  postBuildDuplicateResponseSchema,
  postBuildRequestSchema
} from "../schemas/build.js";
import type { BuildService } from "../services/build-service.js";

const buildIdParamsSchema = z.object({
  buildId: z.string().uuid()
});

export async function registerBuildRoutes(
  app: FastifyInstance,
  buildService: BuildService
): Promise<void> {
  app.post("/builds", async (request, reply) => {
    const payload = postBuildRequestSchema.parse(request.body);
    const result = await buildService.createBuild(payload);

    if (result.duplicate) {
      const body = postBuildDuplicateResponseSchema.parse(result);
      return reply.status(409).send(body);
    }

    const body = postBuildAcceptedResponseSchema.parse(result);
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

    const body = getBuildResponseSchema.parse(result);
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

    const body = getBuildLogsResponseSchema.parse(result);
    return reply.status(200).send(body);
  });
}
