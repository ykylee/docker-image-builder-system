/**
 * Admin guard helper — TASK-084 (deep link UX).
 *
 * Background (TASK-076):
 *   `ADMIN_IDS` env 로 canonical seed 가 정해지고, build-monitor 의
 *   userId 가 그 안에 들어 있어야 admin 메뉴가 노출되며 `/admin/*`
 *   페이지의 backend 호출도 통과한다. userId 가 admin allow-list 에
 *   없는 상태에서 `/admin/builds` 같은 deep link 를 직접 입력하면
 *   backend 가 403 으로 거절하고 화면에 raw error envelope 이 그대로
 *   노출됐다 — 사용자에게 친절하지 않다.
 *
 * 이 helper 는 admin 페이지의 `onMount` 첫 단계에서 호출되어:
 *   1. adminAllowListStore 가 비어 있으면 refresh 시도 (X-Admin-Id:
 *      caller userId 헤더). 단, refresh 자체가 backend 에 round-trip
 *      을 만들므로, refresh 가 403 으로 거절되는 경우 (caller 가 admin
 *      이 아닌 경우) 는 catch 후 빈 캐시 상태로 둔다 — callerId 기준
 *      의 거부 응답은 helper 의 contains 체크에서 자연스럽게 false 가
 *      된다.
 *   2. callerId 가 allow-list 에 들어 있으면 `{ isAdmin: true,
 *      allowList }` 를 반환. 들어 있지 않으면 `{ isAdmin: false,
 *      allowList }` 를 반환. userId 가 falsy 면 `{ isAdmin: false,
 *      allowList: [] }` (caller 가 Login 페이지로 redirect 되어야
 *      한다는 의미).
 *
 * 페이지 사용 패턴:
 *   ```ts
 *   let accessDenied = $state(false);
 *   onMount(async () => {
 *     if (!userId) { push("/"); return; }
 *     const guard = await ensureAdminAccess(userId);
 *     if (!guard.isAdmin) { accessDenied = true; loading = false; return; }
 *     await refresh(userId, ...);
 *   });
 *   ```
 *
 * Backend 동작은 변경하지 않는다. 이 helper 는 frontend-only UX 봉인
 * 으로, 단일 source-of-truth 인 Build Server 의 X-Admin-Id 401/403
 * envelope 은 그대로 유지된다 (TASK-049 / TASK-076 의 admin guard
 * contract 와 정합).
 */
import { adminAllowListStore } from "./admin-store.js";

export interface AdminAccessResult {
  /**
   * true if `callerId` is in the admin allow-list (or already known to
   * be in it via the cached snapshot). false otherwise — including the
   * case where `callerId` is falsy.
   */
  isAdmin: boolean;
  /** The allow-list as observed at the time of the call (possibly empty). */
  allowList: string[];
  /**
   * The reason a caller was denied. Useful for surfacing a more accurate
   * message in the page's error panel.
   *
   *   - `"NO_USER"`: callerId 가 falsy.
   *   - `"FORBIDDEN"`: refresh 가 backend 401/403 으로 거절 — caller 가
   *     admin 이 아님이 확정.
   *   - `"NOT_IN_ALLOW_LIST"`: refresh 가 성공했거나 캐시가 있었지만
   *     callerId 가 목록에 없음.
   */
  reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST";
}

export async function ensureAdminAccess(
  callerId: string | null | undefined
): Promise<AdminAccessResult> {
  if (!callerId) {
    return { isAdmin: false, allowList: [], reason: "NO_USER" };
  }
  // 캐시가 비어 있으면 refresh 시도. Header.svelte 가 같은 helper 를 호출
  // 하는 페이지 (Login 직후 진입 흐름) 가 있다면 이미 채워져 있을 수
  // 있고, deep link 직접 진입 (이 helper 의 1차 사용 케이스) 라면 보통
  // 비어 있다.
  let refreshFailedForbidden = false;
  if (adminAllowListStore.snapshot().length === 0) {
    try {
      await adminAllowListStore.refresh(callerId);
    } catch (err) {
      // 403/401 모두 FORBIDDEN 으로 처리 — caller 의 admin 미허용이
      // backend 에서 확정. 그 외 에러 (네트워크 / 5xx) 는 캐시를 변경
      // 하지 않고 fallback — contains 체크는 캐시 (빈 배열) 기준이므로
      // isAdmin=false 가 자연 도출.
      const message = err instanceof Error ? err.message : String(err);
      if (/failed: 401|failed: 403/.test(message)) {
        refreshFailedForbidden = true;
      }
    }
  }
  const allowList = adminAllowListStore.snapshot();
  if (adminAllowListStore.contains(callerId)) {
    return { isAdmin: true, allowList, reason: "NOT_IN_ALLOW_LIST" };
  }
  return {
    isAdmin: false,
    allowList,
    reason: refreshFailedForbidden ? "FORBIDDEN" : "NOT_IN_ALLOW_LIST"
  };
}
