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

// TASK-161 (P2-M2 Step 1): legacy `previewStatuses` enum 제거.
//   6 values (NOT_REQUESTED / QUEUED / PROVISIONING / READY / FAILED /
//   EXPIRED) 는 `TestDeployment` 응답의 shim 으로 남겨뒀었는데, 이제
//   testDeploymentSchema.status 가 canonical `executionStatuses` 로
//   흡수됐고 (response.ts), read-only `GET /test-deployment` 도 Step 2 에서
//   제거된다. 본 enum 의 마지막 사용처였던 `buildStatuses` (canonical 과
//   동일) 와 달리 `previewStatuses` 는 외부 alias 가 아니라 분리된 enum 이라
//   즉시 제거가 안전하다.
// 3-way canonical mirror: Go `apps/runner/internal/contract/status.go` 와
//   Python `apps/skill_mcp/contract/canonical.py` 에는 본 enum 이 **없다** —
//   두 언어 모두 P2-M1 에서 동일 정리를 했으므로 본 TS 정리가 일관되게
//   마무리된다.
