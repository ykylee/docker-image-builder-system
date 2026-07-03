// Canonical lifecycle statuses aligned with the SDLC docs. New
// build/test/deploy/result-delivery work should target this enum first.
export const canonicalBuildStatuses = [
  "RECEIVED",
  "QUEUED",
  "PREPARING_SOURCE",
  "BUILDING",
  "BUILD_SUCCESS",
  "TESTING",
  "TEST_SUCCESS",
  "DEPLOYING",
  "DEPLOY_SUCCESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED"
] as const;

export type CanonicalBuildStatus = (typeof canonicalBuildStatuses)[number];

// Legacy adapter statuses still emitted by the current preview-era
// implementation. These remain in the public union until TASK-054/060
// finish the server and consumer migration.
export const legacyBuildStatuses = [
  "CLAIMED",
  "TEST_READY"
] as const;

export type LegacyBuildStatus = (typeof legacyBuildStatuses)[number];

export const buildStatuses = [
  ...canonicalBuildStatuses,
  ...legacyBuildStatuses
] as const;

export type BuildStatus = (typeof buildStatuses)[number];

// Generic step/result status used by the new nested lifecycle response
// blocks (sourcePreparation/imageBuild/containerTest/deployment/resultDelivery).
export const executionStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUCCESS",
  "FAILED",
  "SKIPPED"
] as const;

export type ExecutionStatus = (typeof executionStatuses)[number];

// Legacy preview/test-deployment states kept for compatibility until the
// Build Server routes and Build Monitor move to the new build/test/deploy
// contract. Prefer the nested `test`, `deploy`, and `resultDelivery`
// response blocks for new code.
export const previewStatuses = [
  "NOT_REQUESTED",
  "QUEUED",
  "PROVISIONING",
  "READY",
  "FAILED",
  "EXPIRED"
] as const;

export type PreviewStatus = (typeof previewStatuses)[number];
