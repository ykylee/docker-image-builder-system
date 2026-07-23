import { z } from "zod";

export const buildPhases = [
  "REQUEST_ACCEPTED",
  "QUEUE_CLAIMED",
  "SOURCE_PREPARED",
  "DOCKER_BUILD_STARTED",
  "DOCKER_BUILD_COMPLETED",
  "CONTAINER_TEST_STARTED",
  "CONTAINER_TEST_PASSED",
  "DEPLOYMENT_STARTED",
  "DEPLOYMENT_COMPLETED",
  "COMPLETED",
  "FAILED"
] as const;

export type BuildPhase = (typeof buildPhases)[number];

export const buildPhaseSchema = z
  .enum(buildPhases)
  .meta({
    id: "BuildPhase",
    description:
      "Discrete build lifecycle phase reported by the Go Runner. Drives host-side status transitions and is the canonical state machine for PKG-005/006."
  });
