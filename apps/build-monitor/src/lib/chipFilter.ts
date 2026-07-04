// TASK-064 운영 baseline — TASK-060 3차 PR (PR #16) 에서
// `BuildsList.svelte` / `AdminBuilds.svelte` 각자 inline 으로 두었던
// `matchesChip` helper 를 단일 source-of-truth 로 추출. canonical
// lifecycleStatus 와 legacy status 양쪽 매칭 + canonical success 계열은
// COMPLETED chip 으로 분류해 BUILDING chip 에서 제외.

export type StatusFilter = "ALL" | "BUILDING" | "COMPLETED" | "FAILED";

export const CANONICAL_SUCCESS_STATUSES = [
  "BUILD_SUCCESS",
  "TEST_SUCCESS",
  "DEPLOY_SUCCESS"
] as const;

export interface ChipFilterable {
  status: string;
  lifecycleStatus?: string;
}

export function matchesChip(b: ChipFilterable, f: StatusFilter): boolean {
  if (f === "ALL") return true;
  // COMPLETED chip — canonical success 계열 전부 매칭.
  if (f === "COMPLETED") {
    return CANONICAL_SUCCESS_STATUSES.includes(
      b.lifecycleStatus as (typeof CANONICAL_SUCCESS_STATUSES)[number]
    );
  }
  if (b.lifecycleStatus === f) return true;
  if (b.status === f) {
    // legacy status 만 매칭되는 경우 — canonical success 가 emit 됐다면
    // BUILDING chip 이 아니라 COMPLETED chip 으로 분류되어야 한다. PR #16
    // 의 test "status chip matches canonical lifecycleStatus alongside
    // legacy status" 가 기대한 의미와 동일.
    if (
      f === "BUILDING" &&
      CANONICAL_SUCCESS_STATUSES.includes(
        b.lifecycleStatus as (typeof CANONICAL_SUCCESS_STATUSES)[number]
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}