// TASK-090: chip filter helper (React).
//
// Svelte src/lib/chipFilter.ts 와 1:1 정합. canonical lifecycleStatus 와
// legacy status 양쪽 매칭 + canonical success 계열은 COMPLETED chip 으로
// 분류 (BUILDING chip 에서 제외).

export type StatusFilter = "ALL" | "BUILDING" | "COMPLETED" | "FAILED";

export const CANONICAL_SUCCESS_STATUSES = [
  "BUILD_SUCCESS",
  "TEST_SUCCESS",
  "DEPLOY_SUCCESS"
] as const;

export type CanonicalSuccessStatus =
  (typeof CANONICAL_SUCCESS_STATUSES)[number];

export interface ChipFilterable {
  status: string;
  lifecycleStatus?: string;
}

export function matchesChip(b: ChipFilterable, f: StatusFilter): boolean {
  if (f === "ALL") return true;
  if (f === "COMPLETED") {
    return CANONICAL_SUCCESS_STATUSES.includes(
      b.lifecycleStatus as CanonicalSuccessStatus
    );
  }
  if (b.lifecycleStatus === f) return true;
  if (b.status === f) {
    if (
      f === "BUILDING" &&
      CANONICAL_SUCCESS_STATUSES.includes(
        b.lifecycleStatus as CanonicalSuccessStatus
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}