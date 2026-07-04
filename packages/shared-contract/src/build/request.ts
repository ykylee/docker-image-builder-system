import { z } from "zod";

import { buildStatuses } from "./status.js";

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

// TASK-066: response body for `POST /builds/:buildId/source`. Returns
// the actual checksum and size after the server has verified the
// payload against the build's `SourceArchive` metadata. Echoes the
// buildId so a Skill that batches uploads can pair the response with
// the originating build without re-parsing the URL.
export const sourceArchiveUploadResponseSchema = z
  .object({
    buildId: z.string().uuid(),
    checksumSha256: z.string().min(1),
    sizeBytes: z.int().nonnegative()
  })
  .meta({
    id: "SourceArchiveUploadResponse",
    description:
      "Response body for POST /builds/{buildId}/source. The server echoes the recomputed SHA-256 and observed size after accepting the upload."
  });

export type SourceArchiveUploadResponse = z.infer<typeof sourceArchiveUploadResponseSchema>;

export const buildRequestSchema = z
  .object({
    // appName is the canonical identity of the application being built.
    // The previous (projectId, repositoryId) pair was collapsed into a
    // single appName per the v0.2 spec simplification — the admin UI
    // and the build server only ever need one identifier per build.
    // Active-build de-duplication locks on appName only (1 active build
    // per app). See apps/build-server/src/repositories/* for the lock.
    appName: z.string().min(1).meta({
      description:
        "Canonical application name. Used as the active-build deduplication key and rendered in the build list/detail UI."
    }),
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
      .enum(buildStatuses)
      .optional()
      .meta({
        description:
          "Optional status filter. Accepts the canonical lifecycle statuses plus the temporary legacy adapter statuses still emitted by the preview-era implementation. Omitted = all."
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
