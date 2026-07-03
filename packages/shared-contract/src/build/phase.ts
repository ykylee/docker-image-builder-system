export const buildPhases = [
  "REQUEST_ACCEPTED",
  "QUEUE_CLAIMED",
  "SOURCE_PREPARED",
  "DOCKER_BUILD_STARTED",
  "DOCKER_BUILD_COMPLETED",
  "PREVIEW_QUEUED",
  "PREVIEW_READY",
  "COMPLETED",
  "FAILED"
] as const;

export type BuildPhase = (typeof buildPhases)[number];
