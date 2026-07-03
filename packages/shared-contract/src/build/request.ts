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
