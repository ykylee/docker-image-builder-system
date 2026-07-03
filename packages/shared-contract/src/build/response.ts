import { z } from "zod";

import { errorCodes } from "./errors.js";
import { buildPhases } from "./phase.js";
import { buildStatuses, previewStatuses } from "./status.js";

export const buildErrorSchema = z.object({
  code: z.enum(errorCodes),
  message: z.string().min(1)
});

export const buildSummarySchema = z.object({
  buildId: z.string().uuid(),
  projectId: z.string().min(1),
  repositoryId: z.string().min(1),
  status: z.enum(buildStatuses),
  phase: z.enum(buildPhases),
  previewStatus: z.enum(previewStatuses),
  previewUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const buildAcceptedResponseSchema = z.object({
  accepted: z.literal(true),
  duplicate: z.literal(false),
  build: buildSummarySchema
});

export const buildDuplicateResponseSchema = z.object({
  accepted: z.literal(false),
  duplicate: z.literal(true),
  reason: z.enum(["ACTIVE_BUILD_EXISTS"]),
  build: buildSummarySchema
});

export const buildStatusResponseSchema = z.object({
  build: buildSummarySchema,
  lastError: buildErrorSchema.nullable()
});

export const buildLogEntrySchema = z.object({
  id: z.string().uuid(),
  buildId: z.string().uuid(),
  phase: z.enum(buildPhases),
  message: z.string().min(1),
  createdAt: z.string().datetime()
});

export const buildLogsResponseSchema = z.object({
  buildId: z.string().uuid(),
  logs: z.array(buildLogEntrySchema)
});

export type BuildError = z.infer<typeof buildErrorSchema>;
export type BuildSummary = z.infer<typeof buildSummarySchema>;
export type BuildAcceptedResponse = z.infer<typeof buildAcceptedResponseSchema>;
export type BuildDuplicateResponse = z.infer<typeof buildDuplicateResponseSchema>;
export type BuildStatusResponse = z.infer<typeof buildStatusResponseSchema>;
export type BuildLogEntry = z.infer<typeof buildLogEntrySchema>;
export type BuildLogsResponse = z.infer<typeof buildLogsResponseSchema>;
