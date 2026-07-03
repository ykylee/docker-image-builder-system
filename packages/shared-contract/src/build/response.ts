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

export const claimRequestSchema = z.object({
  runnerId: z.string().min(1),
  capabilities: z.array(z.string().min(1)).default([])
});

export const claimResponseSchema = z.object({
  claimed: z.boolean(),
  build: buildStatusResponseSchema.nullable(),
  reason: z.enum(["NO_BUILD_AVAILABLE", "ACTIVE_BUILD_EXISTS", "QUEUE_CLAIM_FAILED"]).nullable()
});

export const phaseUpdateRequestSchema = z.object({
  phase: z.enum(buildPhases),
  runnerId: z.string().min(1),
  occurredAt: z.string().datetime().optional()
});

export type ClaimRequest = z.infer<typeof claimRequestSchema>;
export type ClaimResponse = z.infer<typeof claimResponseSchema>;
export type PhaseUpdateRequest = z.infer<typeof phaseUpdateRequestSchema>;

// testDeployment minimal schema (canonical doc §9)
export const testDeploymentSchema = z.object({
  status: z.enum(previewStatuses),
  previewUrl: z.string().url().nullable(),
  host: z.string().nullable(),
  hostPort: z.int().nonnegative().nullable(),
  internalPort: z.int().positive().nullable(),
  expiresAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime()
});

export const testDeploymentQueueRequestSchema = z.object({
  internalPort: z.int().positive(),
  ttlMinutes: z.int().positive().default(60),
  runnerId: z.string().min(1)
});

export const testDeploymentQueueResponseSchema = z.object({
  testDeployment: testDeploymentSchema
});

export const testDeploymentReadyRequestSchema = z.object({
  previewUrl: z.string().url(),
  host: z.string().min(1),
  hostPort: z.int().nonnegative(),
  runnerId: z.string().min(1)
});

export const testDeploymentStatusRequestSchema = z.object({
  status: z.enum(["PROVISIONING", "READY", "FAILED", "EXPIRED"]),
  runnerId: z.string().min(1)
});

export type TestDeployment = z.infer<typeof testDeploymentSchema>;
export type TestDeploymentQueueRequest = z.infer<typeof testDeploymentQueueRequestSchema>;
export type TestDeploymentQueueResponse = z.infer<typeof testDeploymentQueueResponseSchema>;
export type TestDeploymentReadyRequest = z.infer<typeof testDeploymentReadyRequestSchema>;
export type TestDeploymentStatusRequest = z.infer<typeof testDeploymentStatusRequestSchema>;
