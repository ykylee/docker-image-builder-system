/**
 * API client — Build Server `/openapi.json` 의 1차 subset.
 *
 * PR #6 1차 골격에서는 openapi-fetch + openapi-typescript 의
 * generated client 를 만들기 전에, 자주 쓰는 endpoint 의 응답 타입을
 * hand-typed 로 둔다. 후속 PR 에서:
 *   1) build-time script 가 /openapi.json 을 fetch
 *   2) openapi-typescript 로 ./.generated/openapi.d.ts 생성
 *   3) openapi-fetch client 가 그 타입을 사용
 * 로 자동화. 본 PR 의 types 는 그 자동화의 기준선 (drift 시 alarm).
 */

export type BuildStatus =
  | "QUEUED"
  | "BUILDING"
  | "COMPLETED"
  | "FAILED"
  | "PROVISIONING"
  | "PREVIEW_QUEUED"
  | "PREVIEW_READY"
  | "TEST_READY"
  | "EXPIRED";

export type BuildSummary = {
  buildId: string;
  projectId: string;
  repositoryId: string;
  status: BuildStatus;
  updatedAt: string;
};

export type BuildStatusResponse = {
  buildId: string;
  projectId: string;
  repositoryId: string;
  status: BuildStatus;
  createdAt: string;
  updatedAt: string;
  phases?: { phase: string; at: string }[];
};

export type BuildLogEntry = {
  at: string;
  phase: string;
  message: string;
};

export type BuildLogsResponse = {
  buildId: string;
  cursor: string;
  entries: BuildLogEntry[];
};

const BASE = "/api"; // vite.config proxy → http://127.0.0.1:3000

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listBuilds(): Promise<BuildSummary[]> {
  // 현재 Build Server 에 list endpoint 는 없음. PR #6 1차 골격에서는
  // sample data 를 반환. 후속 PR 에서 /builds list endpoint 추가 + 교체.
  return SAMPLE_BUILDS;
}

export async function getBuild(buildId: string): Promise<BuildStatusResponse> {
  return get<BuildStatusResponse>(`/builds/${buildId}`);
}

export async function getBuildLogs(buildId: string, since?: string): Promise<BuildLogsResponse> {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return get<BuildLogsResponse>(`/builds/${buildId}/logs${q}`);
}

const SAMPLE_BUILDS: BuildSummary[] = [
  {
    buildId: "11111111-1111-1111-1111-111111111111",
    projectId: "demo-frontend",
    repositoryId: "ykylee/demo-frontend",
    status: "BUILDING",
    updatedAt: new Date(Date.now() - 45_000).toISOString()
  },
  {
    buildId: "22222222-2222-2222-2222-222222222222",
    projectId: "demo-api",
    repositoryId: "ykylee/demo-api",
    status: "COMPLETED",
    updatedAt: new Date(Date.now() - 5 * 60_000).toISOString()
  },
  {
    buildId: "33333333-3333-3333-3333-333333333333",
    projectId: "demo-worker",
    repositoryId: "ykylee/demo-worker",
    status: "FAILED",
    updatedAt: new Date(Date.now() - 13 * 60_000).toISOString()
  },
  {
    buildId: "44444444-4444-4444-4444-444444444444",
    projectId: "demo-frontend",
    repositoryId: "ykylee/demo-frontend",
    status: "PREVIEW_READY",
    updatedAt: new Date(Date.now() - 28 * 60_000).toISOString()
  }
];
