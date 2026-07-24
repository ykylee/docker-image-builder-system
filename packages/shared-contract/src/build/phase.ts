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
  // TASK-165 (P2-M5 Step 1): 결과 전달을 1급 phase 로 승격 — 제품 목적의
  // 4번째 단계(build → container test → deploy → **result delivery**)가
  // 모델에 존재하게 한다. runner 는 build/deploy 파이프라인의 terminal 인
  // COMPLETED 까지만 emit 하고, build-server 가 terminal 도달 후 webhook
  // 전달을 수행하며 이 두 phase 를 append 한다(서버 소유). 배열상 COMPLETED
  // 다음에 두어 성공 경로 타임라인이 자연스럽게 이어지게 했다 — 결과 전달은
  // terminal 이후의 외부 알림이므로 COMPLETED 를 뒤따른다. FAILED 는 순서와
  // 무관한 error sink 로 배열 끝에 유지한다.
  "RESULT_DELIVERY_STARTED",
  "RESULT_DELIVERED",
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
