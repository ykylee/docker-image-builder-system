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

// TASK-161 (P2-M2): `previewStatuses` 제거. 컨테이너 테스트/배포/결과 전달
// 블록이 모두 `executionStatuses` 하나를 쓰면서 preview-era 의 두 번째 상태
// 어휘가 사라졌다.
