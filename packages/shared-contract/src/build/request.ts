import { z } from "zod";

export const sourceArchiveSchema = z
  .object({
    objectKey: z.string().min(1),
    checksumSha256: z.string().min(1),
    sizeBytes: z.int().nonnegative()
  })
  .meta({
    id: "SourceArchive",
    description: "Source archive reference uploaded by the Skill before build request."
  });

export type SourceArchive = z.infer<typeof sourceArchiveSchema>;

export const buildRequestSchema = z
  .object({
    projectId: z.string().min(1),
    repositoryId: z.string().min(1),
    requestedBy: z.string().min(1),
    sourceArchive: sourceArchiveSchema,
    entrypointPath: z.string().min(1),
    dockerfilePath: z.string().min(1).default("Dockerfile"),
    previewTtlMinutes: z.int().positive().default(60),
    metadata: z.record(z.string(), z.string()).default({})
  })
  .meta({ id: "BuildRequest", description: "POST /builds payload (Skill → Host)." });

export type BuildRequest = z.infer<typeof buildRequestSchema>;


export const buildListQuerySchema = z
  .object({
    status: z
      .enum([
        "QUEUED",
        "BUILDING",
        "COMPLETED",
        "FAILED",
        "PROVISIONING",
        "PREVIEW_QUEUED",
        "PREVIEW_READY",
        "TEST_READY",
        "EXPIRED"
      ])
      .optional()
      .meta({
        description:
          "Optional status filter. Matches the canonical BuildStatus enum. Omitted = all."
      }),
    requestedBy: z
      .string()
      .min(1)
      .optional()
      .meta({
        description:
          "Optional owner filter. Matches BuildRequest.requestedBy (canonical owner identity, same as IDENTITY_MODEL userId). Omitted = all."
      }),
    limit: z
      .coerce
      .number()
      .int()
      .positive()
      .max(200)
      .default(50)
      .meta({
        description:
          "Maximum number of summaries to return. Server cap is 200. Default 50."
      }),
    cursor: z
      .string()
      .uuid()
      .optional()
      .meta({
        description:
          "Pagination cursor (buildId of the last item in the previous page). Omitted = first page."
      })
  })
  .meta({
    id: "BuildListQuery",
    description:
      "Query string for GET /builds. status and requestedBy filters are optional, limit is server-capped, cursor is opaque (buildId-based)."
  });

export type BuildListQuery = z.infer<typeof buildListQuerySchema>;
