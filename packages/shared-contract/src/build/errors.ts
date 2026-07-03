export const errorCodes = [
  "ACTIVE_BUILD_EXISTS",
  "INVALID_REQUEST",
  "BUILD_NOT_FOUND",
  "LOGS_NOT_FOUND",
  "QUEUE_CLAIM_FAILED",
  "DOCKER_BUILD_FAILED",
  "PREVIEW_PROVISION_FAILED",
  // TASK-062: deployment adapter failure surfaced by Runner during the
  // external deployment phase. Parallel to PREVIEW_PROVISION_FAILED
  // (test environment provisioning) but at the deployment step.
  "DEPLOYMENT_FAILED",
  "UNKNOWN_ERROR"
] as const;

export type ErrorCode = (typeof errorCodes)[number];
