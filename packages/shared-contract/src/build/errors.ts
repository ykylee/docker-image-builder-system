export const errorCodes = [
  "ACTIVE_BUILD_EXISTS",
  "INVALID_REQUEST",
  "BUILD_NOT_FOUND",
  "LOGS_NOT_FOUND",
  "QUEUE_CLAIM_FAILED",
  "DOCKER_BUILD_FAILED",
  "PREVIEW_PROVISION_FAILED",
  "UNKNOWN_ERROR"
] as const;

export type ErrorCode = (typeof errorCodes)[number];
