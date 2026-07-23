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

// TASK-159 (P2-M1 Step 2): legacy adapter status 제거.
//   CLAIMED   → PREPARING_SOURCE  (runner 가 claim 후 source 준비 중)
//   TEST_READY → TEST_SUCCESS     (컨테이너 테스트 통과)
// 외부 소비자가 없어 alias 유예 없이 즉시 제거했다. 이제 buildStatuses 는
// canonical 과 동일하다.
export const buildStatuses = canonicalBuildStatuses;

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
