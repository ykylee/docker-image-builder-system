export const buildStatuses = [
  "QUEUED",
  "CLAIMED",
  "BUILDING",
  "TEST_READY",
  "COMPLETED",
  "FAILED"
] as const;

export type BuildStatus = (typeof buildStatuses)[number];

export const previewStatuses = [
  "NOT_REQUESTED",
  "QUEUED",
  "PROVISIONING",
  "READY",
  "FAILED",
  "EXPIRED"
] as const;

export type PreviewStatus = (typeof previewStatuses)[number];
