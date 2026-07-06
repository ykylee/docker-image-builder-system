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

// TASK-079 (skill 측 build request UI): BuildRequest payload + 응답 type 을
// openapi-generated components schema 의 structural shape 와 동기화.
// BuildRequest 자체는 .generated/openapi.d.ts 의 `BuildRequest` component
// schema 와 1:1 매핑. submitBuildRequest 호출 시 BuildAcceptedResponse 와
// BuildDuplicateResponse 를 모두 받을 수 있어 union 으로 노출.
export type BuildRequestPayload = components["schemas"]["BuildRequest"];
export type BuildAcceptedResponse = components["schemas"]["BuildAcceptedResponse"];
export type BuildDuplicateResponse = components["schemas"]["BuildDuplicateResponse"];
export type BuildRequestResponse = BuildAcceptedResponse | BuildDuplicateResponse;

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

// TASK-079 (skill 측 build request UI): POST /builds helper.
//
// openapi-fetch 의 `POST` 동적 URL 치환 helper 를 직접 호출. 응답 envelope 은
// 202 (BuildAcceptedResponse) 또는 409 (BuildDuplicateResponse) 둘 다 가능
// — caller 가 `result.duplicate` 분기로 새 build 와 중복 build 를 구분.
//
// 표준 검증 시나리오:
//   1. fresh appName → { accepted: true, duplicate: false, build }
//   2. 같은 appName 재시도 → { accepted: false, duplicate: true, reason: "ACTIVE_BUILD_EXISTS", build }
//   3. invalid payload → fetchFn 이 throw (openapi-fetch 가 4xx/5xx 를 error 로 wrapping)
export async function submitBuildRequest(
  payload: BuildRequestPayload,
  options: { headers?: Record<string, string> } = {}
): Promise<BuildRequestResponse> {
  const fetchFn = (api as unknown as {
    POST: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).POST;
  const result = (await fetchFn("/builds", {
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    },
    body: payload
  })) as {
    data?: BuildRequestResponse;
    error?: unknown;
    response?: { status?: number };
  };
  if (result.data) {
    return result.data;
  }
  const status = result.response?.status ?? 0;
  throw new Error(
    `POST /builds failed: ${status} ${JSON.stringify(result.error)}`
  );
}

// TASK-079 셀프 리뷰 C-2 보완: submitBuildRequest 가 throw 한 error 를
// BuildRequest UI 가 친화적으로 표시할 수 있도록 변환하는 helper.
//
// 백엔드 fastify-zod 가 잘못된 payload 에 대해 다음 envelope 으로 400/500
// 응답:
//   {
//     statusCode: 500,
//     error: "Internal Server Error",
//     message: "[{expected:'string',code:'invalid_type',path:['appName'],message:'...'}, ...]"
//   }
// `message` 가 stringified JSON array 이고, 각 element 가 zod issue 의
// structural shape (expected / code / path[] / message).
//
// 본 helper 는:
//   1. message field 의 JSON array 를 parse 시도
//   2. zod issue 들을 {path, message} 형태로 변환 (path 는 'a.b.c' 형식)
//   3. summary 는 "N field(s) failed" 같은 짧은 한 줄 요약
//
// message 가 JSON parse 실패 시 (예: 일반 500 error), fieldErrors 는 empty
// array 이고 summary 는 throw 된 Error 의 message 그대로 — caller 가 일반
// error banner 에 표시 가능.
export interface ParsedApiError {
  /** 1줄 요약. error banner 에 표시. */
  summary: string;
  /** field-level 에러. zod issue 가 detected 된 경우에만 non-empty. */
  fieldErrors: Array<{ path: string; message: string }>;
}

export function parseApiError(err: unknown): ParsedApiError {
  const raw = err instanceof Error ? err.message : String(err);
  // openapi-fetch 가 throw 하는 Error message 형식:
  //   "POST /builds failed: 500 {"statusCode":500,...,\"message\":\"[...]\"}"
  // 또는 inner JSON array 도 { } 를 포함하므로 단순 lastIndexOf 는 안 됨.
  // 대신 "failed:" prefix 이후 첫 '{' 부터 brace-count 로 balanced
  // envelope 추출. envelope 안의 모든 '{' / '}' 가 balanced 이므로 그 중
  // 가장 마지막 '}' 가 outer envelope 의 closing brace.
  const failedAt = raw.indexOf("failed:");
  const searchStart = failedAt >= 0 ? failedAt : 0;
  let jsonStart = -1;
  for (let i = searchStart; i < raw.length; i++) {
    if (raw[i] === "{") {
      jsonStart = i;
      break;
    }
  }
  if (jsonStart === -1) {
    return { summary: raw, fieldErrors: [] };
  }
  // brace-count 로 balanced JSON envelope 끝 찾기.
  let depth = 0;
  let jsonEnd = -1;
  let inString = false;
  let escape = false;
  for (let i = jsonStart; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i;
        break;
      }
    }
  }
  if (jsonEnd === -1) {
    return { summary: raw, fieldErrors: [] };
  }
  const jsonText = raw.slice(jsonStart, jsonEnd + 1);
  let parsed: {
    statusCode?: number;
    error?: string;
    message?: string | unknown[];
  };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { summary: raw, fieldErrors: [] };
  }
  // backend envelope: { statusCode, error, message } — message 가 stringified
  // JSON array of zod issues.
  if (typeof parsed.message !== "string") {
    return {
      summary: parsed.error
        ? `${parsed.statusCode ?? "?"} ${parsed.error}`
        : raw,
      fieldErrors: []
    };
  }
  // message 가 stringified JSON array 인지 시도.
  let issues: Array<{
    expected?: string;
    code?: string;
    path?: string[];
    message?: string;
  }>;
  try {
    const inner = JSON.parse(parsed.message);
    if (Array.isArray(inner)) {
      issues = inner as typeof issues;
    } else {
      // message 가 array 가 아니라 일반 string. 그냥 summary 에 노출.
      return {
        summary: parsed.message || raw,
        fieldErrors: []
      };
    }
  } catch {
    // message 가 JSON 아님 (e.g., 단순 string error).
    return {
      summary: parsed.message || raw,
      fieldErrors: []
    };
  }
  const fieldErrors: ParsedApiError["fieldErrors"] = [];
  for (const issue of issues) {
    if (Array.isArray(issue.path) && issue.message) {
      fieldErrors.push({
        path: issue.path.join("."),
        message: issue.message
      });
    }
  }
  const summary =
    fieldErrors.length > 0
      ? `${fieldErrors.length} field(s) failed: ${fieldErrors
          .map((f) => f.path)
          .join(", ")}`
      : parsed.message || raw;
  return { summary, fieldErrors };
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

// ---------------------------------------------------------------------------
// Runner registry (TASK-069).
//
// Mirrors server-side AdminRunner + AdminRunnerListResponse +
// AdminRunnerPatchRequest/Response + AdminRunnerDeleteResponse. The
// Build Server exposes:
//   GET    /admin/runners             -> AdminRunnerListResponse
//   PATCH  /admin/runners/:runnerId   -> AdminRunnerPatchResponse (DISABLE/REACTIVATE)
//   DELETE /admin/runners/:runnerId   -> AdminRunnerDeleteResponse (idempotent)
// All three require X-Admin-Id set to a caller already in the admin allow-list.
// ---------------------------------------------------------------------------

export type RunnerStatus = "ACTIVE" | "DISABLED";

export interface AdminRunner {
  runnerId: string;
  status: RunnerStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  buildsClaimed: number;
  buildsCompleted: number;
  currentBuildId: string | null;
  lastError: string | null;
}

export interface AdminRunnerListResponse {
  runners: AdminRunner[];
}

export interface AdminRunnerPatchRequest {
  status: RunnerStatus;
}

export interface AdminRunnerPatchResponse {
  runner: AdminRunner;
}

export interface AdminRunnerDeleteResponse {
  removedRunnerId: string;
}

export async function listAdminRunners(
  adminId: string
): Promise<AdminRunnerListResponse> {
  return (await apiGet(
    "/admin/runners",
    "/admin/runners",
    { headers: { "x-admin-id": adminId } }
  )) as AdminRunnerListResponse;
}

export async function patchAdminRunnerStatus(
  adminId: string,
  runnerId: string,
  status: RunnerStatus
): Promise<AdminRunnerPatchResponse> {
  // PATCH /admin/runners/:id 는 path parameter 를 포함 — openapi-fetch 의
  // dynamic URL substitution 을 우회하기 위해 직접 fetch 헬퍼 호출.
  const fetchFn = (api as unknown as {
    PATCH: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).PATCH;
  const result = (await fetchFn(`/admin/runners/${encodeURIComponent(runnerId)}`, {
    headers: {
      "x-admin-id": adminId,
      "content-type": "application/json"
    },
    body: { status }
  })) as { data?: AdminRunnerPatchResponse; response?: { status?: number } };
  if (!result.data) {
    const status = result.response?.status ?? 0;
    throw new Error(`PATCH /admin/runners/${runnerId} failed: ${status}`);
  }
  return result.data;
}

export async function deleteAdminRunner(
  adminId: string,
  runnerId: string
): Promise<AdminRunnerDeleteResponse> {
  const fetchFn = (api as unknown as {
    DELETE: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).DELETE;
  const result = (await fetchFn(`/admin/runners/${encodeURIComponent(runnerId)}`, {
    headers: { "x-admin-id": adminId }
  })) as { data?: AdminRunnerDeleteResponse; response?: { status?: number } };
  if (!result.data) {
    const status = result.response?.status ?? 0;
    throw new Error(`DELETE /admin/runners/${runnerId} failed: ${status}`);
  }
  return result.data;
}
