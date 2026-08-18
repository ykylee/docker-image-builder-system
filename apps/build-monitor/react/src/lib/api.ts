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
// 개발에서는 Vite proxy가 `/api/*`를 Build Server로 rewrite한다.
// production에서는 Build Server가 same-origin으로 API와 SPA를 함께 서빙하므로
// 307 redirect를 거치지 않고 실제 route를 직접 호출한다. redirect 중 일부
// 브라우저/프록시가 X-Admin-Id header를 보존하지 않아 admin 목록이 비는 문제를
// 피하기 위한 정렬이다.

import createClient from "openapi-fetch";
import type { paths, components } from "../../../.generated/openapi.d.ts";

const APP_ROUTE_ROOTS = new Set(["login", "builds", "services", "build-request", "api-console", "admin"]);

export function getApiBaseUrl(): string {
  if (import.meta.env.DEV) return "/api";
  if (typeof window !== "undefined") {
    const firstSegment = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
    if (firstSegment !== "" && !APP_ROUTE_ROOTS.has(firstSegment)) {
      // openapi-fetch concatenates baseUrl and schema paths as strings. An
      // absolute context-aware base is therefore required; `./api` would be
      // resolved from `/context/admin/` as `/context/admin/api/...` for a
      // deep Admin route.
      return `/${firstSegment}/api`;
    }
    return "/api";
  }
  return "/api";
}

export const api = createClient<paths>({
  // Hosted bundles use the cluster-local Ingress API route (`<context>/api`);
  // they never receive or construct a host IP/port. Root Build Server hosting
  // keeps the existing same-origin route.
  baseUrl: getApiBaseUrl()
});

type ApiGetParams = {
  params?: unknown;
  headers?: Record<string, string>;
  body?: unknown;
};

/**
 * Build Server bearer session bridge. The login flow may be backed by an
 * external identity provider, so the client only forwards a token that has
 * already been provisioned in browser storage; it never attempts to mint one.
 */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem("accessToken") ?? window.localStorage.getItem("accessToken");
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("accessToken", token);
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem("accessToken");
  window.localStorage.removeItem("accessToken");
}

function withAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = getAccessToken();
  if (!token) return headers;

  // Once a cryptographic principal is present, do not send caller-supplied
  // identity headers. The Build Server auth hook derives these compatibility
  // headers from the verified token for legacy route guards; keeping the
  // browser values out avoids implying that userId/adminId is an identity
  // assertion.
  const { "X-User-Id": _userId, "X-Admin-Id": _adminId, ...nonIdentityHeaders } = headers;
  void _userId;
  void _adminId;
  return { ...nonIdentityHeaders, Authorization: `Bearer ${token}` };
}

async function apiGet(
  path: keyof paths | string,
  _pathStr: string,
  init: ApiGetParams = {}
): Promise<unknown> {
  const fetchFn = (api as unknown as {
    GET: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).GET;
  const result = (await fetchFn(path as string, { ...init, headers: withAuthHeaders(init.headers) })) as {
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

export async function listUserHostedServices(
  userId: string
): Promise<{ services: HostedServiceView[] }> {
  return (await apiGet("/services", "/services", {
    headers: { "X-User-Id": userId }
  })) as { services: HostedServiceView[] };
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
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  callerId: string,
  body?: unknown
): Promise<unknown> {
  const fn = (api as unknown as Record<string, (p: string, init: unknown) => Promise<unknown>>)[method];
  return fn(path, {
    headers: withAuthHeaders({ "X-Admin-Id": callerId }),
    body
  });
}

async function apiPut(path: string, callerId: string, body: unknown): Promise<unknown> {
  const fn = (api as unknown as Record<string, (p: string, init: unknown) => Promise<unknown>>).PUT;
  const result = (await fn(path, {
    headers: withAuthHeaders({ "X-Admin-Id": callerId }),
    body
  })) as { data?: unknown; error?: unknown; response?: { status?: number } };
  if (result.data === undefined) {
    throw new Error(`PUT ${path} failed: ${result.response?.status ?? 0} ${JSON.stringify(result.error)}`);
  }
  return result.data;
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

// TASK-168 (P3-M3): 호스팅 관리 helpers. generated openapi.d.ts 가
// /admin/hosted-services response 를 추론하지 못해(build-server openapi 에
// 미등록) inline 타입으로 받는다 — admin/admins 패턴과 동일.
export type HostedServiceView = {
  appName: string;
  contextPath: string;
  namespace: string;
  deploymentName: string;
  containerPort: number;
  stripPrefix: boolean;
  hostingScheme?: "path" | "subdomain";
  effectiveTier?: "sandbox" | "standard" | "production";
  serviceSize?: "small" | "medium" | "large";
  hostingPolicyVersion?: string;
  resources?: {
    cpuRequest: string;
    memoryRequest: string;
    cpuLimit: string;
    memoryLimit: string;
    replicas: number;
  };
  status: string;
  url: string | null;
  currentBuildId: string | null;
  imageRef: string | null;
  createdAt: string;
  updatedAt: string;
  lastDeployedAt: string | null;
  // TASK-174 (v0.7.0): live k8s status 캐시(주기 sync). null = 아직 sync 안 됨.
  availableReplicas: number | null;
  lastSyncedAt: string | null;
};

export async function listHostedServices(
  callerId: string
): Promise<{ services: HostedServiceView[] }> {
  return (await apiGet("/admin/hosted-services", "/admin/hosted-services", {
    headers: { "X-Admin-Id": callerId }
  })) as { services: HostedServiceView[] };
}

export type ServiceDatabaseStatusView = {
  appName: string;
  engine: "postgres";
  schemaName: string;
  roleName: string;
  secretName: string;
  status: "PROVISIONING" | "READY" | "FAILED";
  migrationCommand: string | null;
  migrationRevision: number | null;
  created: boolean;
};

export async function getHostedServiceDatabaseStatus(
  callerId: string,
  appName: string
): Promise<ServiceDatabaseStatusView> {
  return (await apiGet(
    "/admin/hosted-services/{appName}/database",
    `/admin/hosted-services/${encodeURIComponent(appName)}/database`,
    { headers: { "X-Admin-Id": callerId }, params: { path: { appName } } }
  )) as ServiceDatabaseStatusView;
}

export type HostingCapacityView = {
  capacity: { cpuMillicores: number; memoryMi: number };
  used: { cpuMillicores: number; memoryMi: number };
  remaining: { cpuMillicores: number; memoryMi: number };
  tiers: Record<string, {
    tier: "sandbox" | "standard" | "production";
    cpuServices: number;
    memoryServices: number;
    maxServices: number;
    perService: { cpuMillicores: number; memoryMi: number; replicas: number };
  }>;
};

export async function getHostingCapacity(
  callerId: string
): Promise<HostingCapacityView> {
  return (await apiGet("/admin/hosting-capacity", "/admin/hosting-capacity", {
    headers: { "X-Admin-Id": callerId }
  })) as HostingCapacityView;
}

export async function stopHostedService(
  callerId: string,
  appName: string
): Promise<HostedServiceView> {
  return (await apiSend(
    "POST",
    `/admin/hosted-services/${encodeURIComponent(appName)}/stop`,
    callerId
  )) as HostedServiceView;
}

export async function startHostedService(
  callerId: string,
  appName: string
): Promise<HostedServiceView> {
  return (await apiSend(
    "POST",
    `/admin/hosted-services/${encodeURIComponent(appName)}/start`,
    callerId
  )) as HostedServiceView;
}

export async function removeHostedService(
  callerId: string,
  appName: string
): Promise<HostedServiceView> {
  return (await apiSend(
    "DELETE",
    `/admin/hosted-services/${encodeURIComponent(appName)}`,
    callerId
  )) as HostedServiceView;
}

export type ServiceManifestView = {
  version: 1;
  service: { appName: string; image: { repository: string; tag: string } };
  runtime: { port: number; command?: string; healthPath: string; basePathEnv: string };
  hosting: { scheme: "path" | "subdomain"; contextPath: string; stripPrefix: boolean; tier: "sandbox" | "standard" | "production"; replicas: number };
  deployment: { adapter: "kubectl" | "helm" | "argocd"; namespace: string };
};

export type ServiceManifestResponseView = {
  appName: string;
  currentRevision: number;
  manifest: ServiceManifestView;
  updatedBy: string;
  updatedAt: string;
};

export async function getHostedServiceManifest(
  callerId: string,
  appName: string
): Promise<ServiceManifestResponseView> {
  return (await apiGet(
    "/admin/hosted-services/{appName}/manifest",
    `/admin/hosted-services/${appName}/manifest`,
    { headers: { "X-Admin-Id": callerId }, params: { path: { appName } } }
  )) as ServiceManifestResponseView;
}

export async function updateHostedServiceManifest(
  callerId: string,
  appName: string,
  manifest: ServiceManifestView
): Promise<ServiceManifestResponseView> {
  return (await apiPut(
    `/admin/hosted-services/${encodeURIComponent(appName)}/manifest`,
    callerId,
    manifest
  )) as ServiceManifestResponseView;
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

// TASK-099: BuildRequest UI (POST /builds payload 직접 작성) helper.
//
// Svelte src/lib/api.ts 의 submitBuildRequest + parseApiError 와 1:1 정합.
// 202 (BuildAcceptedResponse) 또는 409 (BuildDuplicateResponse) 둘 다 가능
// — caller 가 `result.duplicate` 분기로 새 build 와 중복 build 를 구분.
//
// openapi-fetch 의 `POST` 동적 URL 치환 helper 를 직접 호출. generated
// openapi.d.ts 가 BuildRequest / BuildAcceptedResponse / BuildDuplicateResponse
// schema 를 모두 노출하므로 components alias 사용.
export type BuildRequestPayload = components["schemas"]["BuildRequest"];
export type BuildAcceptedResponse = components["schemas"]["BuildAcceptedResponse"];
export type BuildDuplicateResponse = components["schemas"]["BuildDuplicateResponse"];
export type BuildRequestResponse = BuildAcceptedResponse | BuildDuplicateResponse;

export async function submitBuildRequest(
  payload: BuildRequestPayload
): Promise<BuildRequestResponse> {
  const fetchFn = (api as unknown as {
    POST: (p: string, init: ApiGetParams) => Promise<unknown>;
  }).POST;
  const result = (await fetchFn("/builds", {
    headers: { "content-type": "application/json" },
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

// TASK-099: parseApiError helper. submitBuildRequest 가 throw 한 error 를
// BuildRequest UI 가 친화적으로 표시할 수 있도록 변환. zod field-level error
// 가 들어있는 경우 field-level banner 에, 그 외는 일반 error banner 에.
//
// Svelte src/lib/api.ts 의 parseApiError 구현을 1:1 이식 — brace-count JSON
// envelope 추출 + zod issue 의 path[] 를 dot-join 한 field-error 변환.
export interface ParsedApiError {
  /** 1줄 요약. error banner 에 표시. */
  summary: string;
  /** field-level 에러. zod issue 가 detected 된 경우에만 non-empty. */
  fieldErrors: Array<{ path: string; message: string }>;
}

export function parseApiError(err: unknown): ParsedApiError {
  const raw = err instanceof Error ? err.message : String(err);
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
    if (inString) {
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
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
  // TASK-130: envelope 타입을 shared-contract 가 생성한 OpenAPI 타입에
  // 묶는다. 서버가 `ApiErrorResponse` 의 형태를 바꾸면 `openapi.d.ts` 가
  // 함께 바뀌고, 이 파일이 컴파일에서 깨진다 — TASK-129 처럼 런타임에
  // 조용히 어긋나는 대신 빌드가 먼저 실패한다.
  //
  // `Partial<>` 인 이유: 여기 들어오는 문자열은 서버 응답이라는 보장이
  // 없다 (네트워크 계층 에러 메시지, 레거시 500 envelope 등). 계약 타입은
  // 필드 이름과 자료형을 고정하는 용도로 쓰고, 존재 여부는 런타임에서 본다.
  // `Pick<>` 으로 감싸는 것이 핵심이다. 생성된 `ApiErrorResponse` 는
  // 서버 스키마가 `.loose()` 라 `& { [key: string]: unknown }` index
  // signature 를 달고 있어서, 그대로 쓰면 `envelope.problems` 같은 오타도
  // `unknown` 으로 통과해 버린다. `Pick` 은 index signature 를 버리므로
  // 계약에 없는 필드를 읽으면 컴파일이 깨진다.
  type ApiErrorResponse = Pick<
    components["schemas"]["ApiErrorResponse"],
    "message" | "issues"
  >;
  type ZodIssueLike = Partial<components["schemas"]["ApiErrorIssue"]>;
  let envelope: Partial<ApiErrorResponse> | null = null;
  try {
    envelope = JSON.parse(jsonText) as Partial<ApiErrorResponse>;
  } catch {
    return { summary: raw, fieldErrors: [] };
  }

  // TASK-129: zod issue 는 두 가지 envelope 으로 도착할 수 있다.
  //
  //   (a) 현행 계약 — `{ message, issues: [...] }`
  //       build-server 의 route handler 가 `safeParse` 실패 시 내보내는
  //       형태 (TASK-127 이 세 handler 를 이 계약으로 정렬).
  //   (b) 레거시 — `{ statusCode, error, message: "[...zod...]" }`
  //       handler 가 bare `.parse` 를 써서 ZodError 가 Fastify 기본
  //       error handler 까지 새어 나갔을 때의 500 응답. TASK-127 이전의
  //       `POST /builds` 가 이랬다.
  //
  // (a) 를 먼저 본다. (b) 는 아직 이 형태로 응답하는 경로가 남아 있을
  // 가능성 + 서버/프론트 배포 시차를 위해 계속 처리한다.
  let issues: ZodIssueLike[] | null = null;
  if (Array.isArray(envelope.issues)) {
    issues = envelope.issues;
  } else if (envelope.message && envelope.message[0] === "[") {
    try {
      issues = JSON.parse(envelope.message) as ZodIssueLike[];
    } catch {
      return { summary: envelope.message, fieldErrors: [] };
    }
  }
  if (!issues) {
    return { summary: envelope.message ?? raw, fieldErrors: [] };
  }
  const fieldErrors = issues.map((issue) => ({
    path: (issue.path ?? []).join("."),
    message: issue.message ?? "Invalid"
  }));
  const summary = `${fieldErrors.length} field(s) failed: ${fieldErrors
    .map((fe) => fe.path)
    .join(", ")}`;
  return { summary, fieldErrors };
}
