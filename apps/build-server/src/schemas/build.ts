import {
  buildAcceptedResponseSchema,
  buildDuplicateResponseSchema,
  buildLogsResponseSchema,
  buildRequestSchema,
  buildStatusResponseSchema
} from "@docker-image-builder-system/shared-contract";

export const postBuildRequestSchema = buildRequestSchema;
export const postBuildAcceptedResponseSchema = buildAcceptedResponseSchema;
export const postBuildDuplicateResponseSchema = buildDuplicateResponseSchema;
export const getBuildResponseSchema = buildStatusResponseSchema;
export const getBuildLogsResponseSchema = buildLogsResponseSchema;
