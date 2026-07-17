// TASK-090/091: Build Server API client (React).
//
// Svelte src/lib/api.ts 와 1:1 정합 — listBuilds / getBuild / getBuildLogs 와
// BuildSummary / BuildListResponse / BuildStatusResponse / BuildLogEntry /
// BuildLogsResponse 타입을 모두 generated openapi.d.ts 로부터 추출. BuildSummary
// 와 동일 schema 는 동일 alias.
//
// openapi-fetch 0.13.8 + openapi-typescript 7.x 조합은 response envelope
// inference 가 깨지는 known issue 가 있어서 helper 의 return 은
// `unknown` 으로 두고 caller 가 inline cast 한다 (TASK-079 주석과 동일).
//
// baseUrl 은 `/api` — dev:react 의 vite proxy 가 :3000 으로 forward,
// production preview 는 별도 (현재 preview server 는 Build Server 와
// 같은 origin 가정 — TASK-093 Build Server swap 시점에 정합 검토).

import createClient from "openapi-fetch";
import type { paths, components } from "../../../.generated/openapi.d.ts";

export const api = createClient<paths>({
  baseUrl: "/api"
});

type ApiGetParams = {
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
export type BuildListResponse = components["schemas"]["BuildListResponse"];
export type BuildListQuery = components["schemas"]["BuildListQuery"];
export type BuildStatusResponse = components["schemas"]["BuildStatusResponse"];
export type BuildLogsResponse = components["schemas"]["BuildLogsResponse"];
export type BuildLogEntry = components["schemas"]["BuildLogEntry"];

export type ListBuildsParams = {
  status?: BuildListQuery["status"];
  requestedBy?: string;
  limit?: BuildListQuery["limit"];
  cursor?: BuildListQuery["cursor"];
};

export async function listBuilds(
  params: ListBuildsParams = {}
): Promise<BuildListResponse> {
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

// TASK-091: 단일 build 상세 조회 (GET /builds/{buildId}). path parameter 는
// openapi-fetch 의 typed GET signature 가 paths 기반 inference 를 요구하지만
// generated paths 가 `/builds/{buildId}` literal 로 키잉돼 있어 string cast 가
// 안전. response envelope 의 2-depth `data` 추출은 apiGet helper 가 처리.
export async function getBuild(buildId: string): Promise<BuildStatusResponse> {
  return (await apiGet(
    "/builds/{buildId}",
    `/builds/${buildId}`,
    { params: { path: { buildId } } }
  )) as BuildStatusResponse;
}

// TASK-091: build log streaming (GET /builds/{buildId}/logs). 1차 구현은
// initial fetch only — cursor 기반 증분 fetch 는 후속 TASK 에서 정합. log
// fetch 실패 (LOGS_NOT_FOUND 등) 는 caller 가 optional 로 처리.
export async function getBuildLogs(buildId: string): Promise<BuildLogsResponse> {
  return (await apiGet(
    "/builds/{buildId}/logs",
    `/builds/${buildId}/logs`,
    { params: { path: { buildId } } }
  )) as BuildLogsResponse;
}

// TASK-095: admin allow-list helpers. Svelte `lib/api.ts` 의 listAdminAllowList /
// addAdminToAllowList / removeAdminFromAllowList 와 1:1 정합. X-Admin-Id
// header 가 Build Server 의 admin 가드 (401/403) 를 통과해야 응답.
// generated openapi.d.ts 가 admin/admins 경로의 response envelope 를
// 완전히 추론하지 못해 `unknown` 으로 받아 inline cast.

export type AdminAllowListResponse = {
  admins: string[];
};

function apiSend(
  method: "POST" | "DELETE" | "PATCH",
  path: string,
  callerId: string,
  body?: unknown
): Promise<unknown> {
  const fn = (api as unknown as Record<string, (p: string, init: unknown) => Promise<unknown>>)[method];
  return fn(path, {
    headers: { "X-Admin-Id": callerId },
    body
  });
}

export async function listAdminAllowList(
  callerId: string
): Promise<AdminAllowListResponse> {
  const result = (await apiGet(
    "/admin/admins",
    "/admin/admins",
    { headers: { "X-Admin-Id": callerId } }
  )) as AdminAllowListResponse;
  return result;
}

export async function addAdminToAllowList(
  callerId: string,
  newAdminId: string
): Promise<AdminAllowListResponse> {
  const result = (await apiSend(
    "POST",
    "/admin/admins",
    callerId,
    { adminId: newAdminId }
  )) as AdminAllowListResponse;
  return result;
}

export async function removeAdminFromAllowList(
  callerId: string,
  target: string
): Promise<{ removed: string; admins: string[] }> {
  const result = (await apiSend(
    "DELETE",
    `/admin/admins/${target}`,
    callerId
  )) as { removed: string; admins: string[] };
  return result;
}

// TASK-098: admin 페이지 endpoint helpers.
// Svelte src/lib/api.ts 의 listAdminBuilds / listAdminUsers 와 1:1 정합.
// X-Admin-Id header 가 Build Server 의 admin 가드 (401/403) 통과 필수.
//
// generated openapi.d.ts 가 /admin/builds 와 /admin/users 의 response
// schema 를 가지고 있어 AdminListBuildsResponse / AdminUserListResponse
// 타입 export 가능. /admin/runners 는 schema 미생성 — RunnerStatus union
// 으로 inline cast.

export type AdminUserBuildSummary = components["schemas"]["AdminUserBuildSummary"];
export type AdminListBuildsResponse = components["schemas"]["AdminListBuildsResponse"];
export type AdminUserListResponse = components["schemas"]["AdminUserListResponse"];

export type ListAdminBuildsParams = {
  requestedBy?: string;
  status?: string;
  limit?: number;
  cursor?: string;
};

export async function listAdminBuilds(
  callerId: string,
  params: ListAdminBuildsParams = {}
): Promise<AdminListBuildsResponse> {
  const query: Record<string, string | number | undefined> = {};
  if (params.requestedBy) query.requestedBy = params.requestedBy;
  if (params.status) query.status = params.status;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.cursor) query.cursor = params.cursor;

  const result = (await apiGet(
    "/admin/builds",
    "/admin/builds",
    { params: { query }, headers: { "X-Admin-Id": callerId } }
  )) as AdminListBuildsResponse;
  return result;
}

export async function listAdminUsers(
  callerId: string
): Promise<AdminUserListResponse> {
  const result = (await apiGet(
    "/admin/users",
    "/admin/users",
    { headers: { "X-Admin-Id": callerId } }
  )) as AdminUserListResponse;
  return result;
}

export type RunnerStatus = "ACTIVE" | "DISABLED";

export type AdminRunner = {
  runnerId: string;
  status: RunnerStatus;
  lastSeenAt: string | null;
  claimsCount: number;
  buildsClaimed: number;
};

export type AdminRunnerListResponse = {
  runners: AdminRunner[];
};

export async function listAdminRunners(
  callerId: string
): Promise<AdminRunnerListResponse> {
  const result = (await apiGet(
    "/admin/runners",
    "/admin/runners",
    { headers: { "X-Admin-Id": callerId } }
  )) as AdminRunnerListResponse;
  return result;
}

export async function disableAdminRunner(
  callerId: string,
  runnerId: string
): Promise<AdminRunner> {
  const result = (await apiSend(
    "PATCH",
    `/admin/runners/${runnerId}`,
    callerId,
    { status: "DISABLED" }
  )) as AdminRunner;
  return result;
}

export async function enableAdminRunner(
  callerId: string,
  runnerId: string
): Promise<AdminRunner> {
  const result = (await apiSend(
    "PATCH",
    `/admin/runners/${runnerId}`,
    callerId,
    { status: "ACTIVE" }
  )) as AdminRunner;
  return result;
}

export async function deleteAdminRunner(
  callerId: string,
  runnerId: string
): Promise<{ deleted: string }> {
  const result = (await apiSend(
    "DELETE",
    `/admin/runners/${runnerId}`,
    callerId
  )) as { deleted: string };
  return result;
}