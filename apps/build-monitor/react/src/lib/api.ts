// TASK-090: Build Server API client (React).
//
// Svelte src/lib/api.ts 와 1:1 정합 — listBuilds / BuildSummary /
// BuildListResponse / chipFilter 의 status union 을 모두 generated
// openapi.d.ts 로부터 추출. BuildSummary 와 동일 schema 는 동일 alias.
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