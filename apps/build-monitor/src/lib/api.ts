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

async function apiGet(
  path: keyof paths,
  _pathStr: string,
  params: unknown
): Promise<unknown> {
  const fetchFn = (api as unknown as {
    GET: (p: string, init: { params: unknown }) => Promise<unknown>;
  }).GET;
  const result = (await fetchFn(path as string, { params })) as {
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
    { query }
  )) as BuildListResponse;
}

export async function getBuild(buildId: string): Promise<BuildStatusResponse> {
  return (await apiGet(
    "/builds/{buildId}",
    `/builds/${buildId}`,
    { path: { buildId } }
  )) as BuildStatusResponse;
}

export async function getBuildLogs(
  buildId: string,
  since?: string
): Promise<BuildLogsResponse> {
  return (await apiGet(
    "/builds/{buildId}/logs",
    `/builds/${buildId}/logs`,
    { path: { buildId }, query: since ? { since } : {} }
  )) as BuildLogsResponse;
}
