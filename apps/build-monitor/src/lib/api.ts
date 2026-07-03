/**
 * API client — Build Server `/openapi.json` 기반.
 *
 * `paths` 의 정확한 TypeScript type 은 `./.generated/openapi.d.ts` 에서
 * import 한다. 해당 파일은 `pnpm run generate:openapi` (또는 predev /
 * prebuild hook) 로 backend 의 `/openapi.json` 으로 자동 생성.
 *
 * PR #6 의 1차 hand-typed types 는 generated type 의 components schemas
 * alias 로 갈음한다.
 *
 * Known issue: openapi-fetch 0.13 + openapi-typescript 7.x 는 response
 * envelope 의 inference 가 깨짐 (특히 `cursor` / `entries` vs `logs` 등
 * schema 의 inline shape). 본 PR 에서는 helper `apiGet` 의 return 을
 * `unknown` 으로 두고, caller 가 명시적으로 inline cast. 후속 PR 에서
 * openapi-fetch 갱신 시 cast 제거 검토.
 */
import createClient from "openapi-fetch";
import type { paths, components } from "../../.generated/openapi.d.ts";

export const api = createClient<paths>({
  baseUrl: "/api"
});

type ApiGetParams = {
  // openapi-fetch 0.13 expects `{ params: { query, path, ... } }` for
  // the dynamic URL substitution and query encoding. We forward the
  // whole `params` shape from the helper. Admin helpers also include
  // `headers` for the X-Admin-Id guard; the underlying `api.GET`
  // supports it. `body` is used by POST / DELETE helpers in this
  // file (AdminAllowList mutations).
  params?: unknown;
  headers?: Record<string, string>;
  body?: unknown;
};

async function apiGet(
  path: keyof paths | string,
  _pathStr: string,
  init: ApiGetParams = {}
): Promise<unknown> {
  const fetchFn = (api as unknown as {
    GET: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).GET;
  const result = (await fetchFn(path as string, init)) as {
    data?: unknown;
    error?: unknown;
    response?: { status?: number };
  };
  if (!result.data) {
    const status = result.response?.status ?? 0;
    throw new Error(
      `GET ${String(path)} failed: ${status} ${JSON.stringify(result.error)}`
    );
  }
  return result.data;
}

export type BuildSummary = components["schemas"]["BuildSummary"];
export type BuildPhaseHistoryEntry = components["schemas"]["BuildPhaseHistoryEntry"];
export type BuildCurrentPhase = components["schemas"]["BuildCurrentPhase"];
export type BuildStatusResponse = components["schemas"]["BuildStatusResponse"];
export type BuildListResponse = components["schemas"]["BuildListResponse"];
export type BuildListQuery = components["schemas"]["BuildListQuery"];
export type BuildLogEntry = components["schemas"]["BuildLogEntry"];

// BuildLogsResponse 는 OpenAPI 에 별도 schema 로 emit 되지 않음
// (registerPath 의 response 가 inline `buildLogEntrySchema[]` 만 가리킴,
// envelope 없음). 1차 inline 정의. 후속 PR 에서 buildLogsResponseSchema
// 추가 + register 시 여기를 components 로 갈음.
export type BuildLogsResponse = {
  buildId: string;
  logs: BuildLogEntry[];
};

// listBuilds query params. requestedBy 는 IDENTITY_MODEL userId 와 같은
// canonical owner key. generated openapi.d.ts 가 갱신되기 전까지는
// BuildListQuery["requestedBy"] 가 없을 수 있어, listBuilds helper 에서는
// 항상 raw string 으로 직렬화하고 type 은 자체 좁은 union 으로 둔다.
export type ListBuildsParams = {
  status?: BuildListQuery["status"];
  requestedBy?: string;
  limit?: BuildListQuery["limit"];
  cursor?: BuildListQuery["cursor"];
};

export async function listBuilds(
  params: ListBuildsParams = {}
): Promise<BuildListResponse> {
  // empty string 은 서버에 보내지 않는다.
  const query: Record<string, string | number | undefined> = {};
  if (params.status) query.status = params.status;
  if (params.requestedBy) query.requestedBy = params.requestedBy;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.cursor) query.cursor = params.cursor;
  return (await apiGet(
    "/builds",
    "/builds",
    { params: { query } }
  )) as BuildListResponse;
}

export async function getBuild(buildId: string): Promise<BuildStatusResponse> {
  return (await apiGet(
    "/builds/{buildId}",
    `/builds/${buildId}`,
    { params: { path: { buildId } } }
  )) as BuildStatusResponse;
}

export async function getBuildLogs(
  buildId: string,
  since?: string
): Promise<BuildLogsResponse> {
  return (await apiGet(
    "/builds/{buildId}/logs",
    `/builds/${buildId}/logs`,
    { params: { path: { buildId }, query: since ? { since } : {} } }
  )) as BuildLogsResponse;
}

// ---------------------------------------------------------------------------
// Admin client (ADMIN-007).
//
// The admin endpoints live under /admin/* and require the X-Admin-Id
// header to be set to a caller id in the build-server's ADMIN_IDS env.
// The list helpers below only change the URL/header; the response
// envelope is the same shape as the user-facing list endpoint so the
// AdminBuilds route can reuse <BuildRow>.
// ---------------------------------------------------------------------------

// Admin response types are hand-typed here. The Build Server emits the
// admin endpoints under /admin/* and the schema is small enough that we
// can avoid a re-run of the openapi-typescript generator (which would
// require a live Build Server). When the generator is re-run end-to-end
// these can be replaced with `components["schemas"][...]` aliases.
//
// Why hand-typed despite the generated `AdminUserBuildSummary` /
// `AdminUserSummary` / `AdminUserListResponse` components already
// existing in `.generated/openapi.d.ts`: the generated file shipped in
// this PR reflects a one-off generator run that the maintainer did
// locally before merging. The CI / predev `pnpm run generate:openapi`
// hook re-runs the generator against a live Build Server, so a fresh
// checkout can regenerate the file from scratch and end up with
// identical types. Until that loop is exercised on every PR, we keep
// the hand-typed mirror so that the build-monitor stays buildable even
// when the generated file is stale (e.g. immediately after pulling a
// branch that has not yet regenerated). When the generator becomes a
// hard CI gate, replace these with `components["schemas"][...]` aliases
// and delete the hand-typed block.
//
// Mirrors `packages/shared-contract/src/build/admin.ts`:
//   AdminListBuildsResponse  = { builds, nextCursor }
//   builds entry is an AdminUserBuildSummary = BuildSummary & { requestedBy }
//   AdminUserListResponse    = { users: AdminUserSummary[] }
// AdminUserBuildSummary is a strict structural superset of BuildSummary
// (which is the user-facing summary type emitted by the Build Server's
// `/builds` endpoint). The status/phase/previewStatus fields use the
// canonical string literal unions from BuildSummary so the admin type
// is assignable wherever BuildSummary is expected. The extra
// `requestedBy` field is the canonical owner key.
export type AdminUserBuildSummary = BuildSummary & { requestedBy: string };

export type AdminListBuildsQuery = {
  status?: string;
  requestedBy?: string;
  limit?: number;
  cursor?: string;
};

export type AdminListBuildsResponse = {
  builds: AdminUserBuildSummary[];
  nextCursor: string | null;
};

export type AdminUserSummary = {
  userId: string;
  buildCount: number;
  lastBuildAt: string | null;
};

export type AdminUserListResponse = {
  users: AdminUserSummary[];
};

export type AdminListBuildsParams = {
  status?: AdminListBuildsQuery["status"];
  requestedBy?: string;
  limit?: AdminListBuildsQuery["limit"];
  cursor?: AdminListBuildsQuery["cursor"];
};

export async function listAdminBuilds(
  adminId: string,
  params: AdminListBuildsParams = {}
): Promise<AdminListBuildsResponse> {
  const query: Record<string, string | number | undefined> = {};
  if (params.status) query.status = params.status;
  if (params.requestedBy) query.requestedBy = params.requestedBy;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.cursor) query.cursor = params.cursor;
  return (await apiGet(
    "/admin/builds",
    "/admin/builds",
    { params: { query }, headers: { "x-admin-id": adminId } }
  )) as AdminListBuildsResponse;
}

export async function listAdminUsers(
  adminId: string
): Promise<AdminUserListResponse> {
  return (await apiGet(
    "/admin/users",
    "/admin/users",
    { headers: { "x-admin-id": adminId } }
  )) as AdminUserListResponse;
}

// ---------------------------------------------------------------------------
// Admin allow-list management (TASK-049).
//
// Mirrors the server-side AdminAllowListResponse / AdminAllowListAddRequest /
// AdminAllowListRemoveResponse. The Build Server exposes:
//   GET    /admin/admins             -> AdminAllowListResponse
//   POST   /admin/admins             -> AdminAllowListResponse (200)
//   DELETE /admin/admins/:adminId    -> AdminAllowListRemoveResponse
// All three require X-Admin-Id set to a caller already in the allow-list.
// ---------------------------------------------------------------------------

export type AdminAllowListResponse = {
  admins: string[];
};

export type AdminAllowListAddRequest = {
  adminId: string;
};

export type AdminAllowListRemoveResponse = {
  removed: string;
  admins: string[];
};

export async function listAdminAllowList(
  adminId: string
): Promise<AdminAllowListResponse> {
  return (await apiGet(
    "/admin/admins",
    "/admin/admins",
    { headers: { "x-admin-id": adminId } }
  )) as AdminAllowListResponse;
}

export async function addAdminToAllowList(
  adminId: string,
  newAdminId: string
): Promise<AdminAllowListResponse> {
  // POST /admin/admins is not modeled in openapi-typescript's `paths` yet
  // (it lives in this hand-typed block until the next generator run).
  // We call openapi-fetch's underlying POST helper directly to avoid
  // forcing a type-cast on a non-existent path key.
  const fetchFn = (api as unknown as {
    POST: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).POST;
  const result = (await fetchFn("/admin/admins", {
    headers: {
      "x-admin-id": adminId,
      "content-type": "application/json"
    },
    body: { adminId: newAdminId }
  })) as { data?: AdminAllowListResponse; response?: { status?: number } };
  if (!result.data) {
    const status = result.response?.status ?? 0;
    throw new Error(
      `POST /admin/admins failed: ${status}`
    );
  }
  return result.data;
}

export async function removeAdminFromAllowList(
  adminId: string,
  target: string
): Promise<AdminAllowListRemoveResponse> {
  const fetchFn = (api as unknown as {
    DELETE: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).DELETE;
  const result = (await fetchFn(`/admin/admins/${target}`, {
    headers: { "x-admin-id": adminId }
  })) as { data?: AdminAllowListRemoveResponse; response?: { status?: number } };
  if (!result.data) {
    const status = result.response?.status ?? 0;
    throw new Error(
      `DELETE /admin/admins/${target} failed: ${status}`
    );
  }
  return result.data;
}
