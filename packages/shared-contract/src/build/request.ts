import { z } from "zod";

import { buildStatuses } from "./status.js";
import { hostingSchemes } from "./response.js";

export const sourceArchiveSchema = z
  .object({
    objectKey: z.string().min(1),
    checksumSha256: z.string().min(1),
    sizeBytes: z.int().nonnegative()
  })
  .meta({
    id: "SourceArchive",
    description: "Source archive reference uploaded by the Skill before build request."
  });

export type SourceArchive = z.infer<typeof sourceArchiveSchema>;

// TASK-066: response body for `POST /builds/:buildId/source`. Returns
// the actual checksum and size after the server has verified the
// payload against the build's `SourceArchive` metadata. Echoes the
// buildId so a Skill that batches uploads can pair the response with
// the originating build without re-parsing the URL.
export const sourceArchiveUploadResponseSchema = z
  .object({
    buildId: z.string().uuid(),
    checksumSha256: z.string().min(1),
    sizeBytes: z.int().nonnegative()
  })
  .meta({
    id: "SourceArchiveUploadResponse",
    description:
      "Response body for POST /builds/{buildId}/source. The server echoes the recomputed SHA-256 and observed size after accepting the upload."
  });

export type SourceArchiveUploadResponse = z.infer<typeof sourceArchiveUploadResponseSchema>;

export const buildRequestSchema = z
  .object({
    // appName is the canonical identity of the application being built.
    // The previous (projectId, repositoryId) pair was collapsed into a
    // single appName per the v0.2 spec simplification — the admin UI
    // and the build server only ever need one identifier per build.
    // Active-build de-duplication locks on appName only (1 active build
    // per app). See apps/build-server/src/repositories/* for the lock.
    appName: z.string().min(1).meta({
      description:
        "Canonical application name. Used as the active-build deduplication key and rendered in the build list/detail UI."
    }),
    requestedBy: z.string().min(1),
    sourceArchive: sourceArchiveSchema,
    entrypointPath: z.string().min(1),
    dockerfilePath: z.string().min(1).default("Dockerfile"),
    // TASK-166 (P3-M1): 호스팅 context path. `https://<host>/<contextPath>/`
    // 로 서비스가 라우팅된다. 미지정 시 서버가 appName 을 정규화해 자동 부여.
    // 서버가 정규화(소문자/URL-safe)·유일성·예약어를 최종 검증하므로 계약은
    // 관대하게 문자열만 받는다.
    contextPath: z.string().min(1).optional().meta({
      description:
        "Optional hosting URL context path. Defaults to a normalized appName. Server normalizes and enforces global uniqueness."
    }),
    // TASK-166 (P3-M1): 앱이 컨테이너 안에서 listen 하는 포트. Ingress/Service
    // 가 이 포트로 트래픽을 보낸다. optional — 서버가 미지정 시 8080 을 쓴다
    // (`.default()` 는 OpenAPI 산출에서 required 로 나와 소비자에게 강제되므로
    // optional + 서버측 fallback 으로 둔다).
    runtimePort: z.int().positive().optional(),
    // TASK-169 (P3-M4): Ingress 가 context-path prefix 를 strip 하는지(설계 §6).
    // true(기본): rewrite-target 으로 prefix 를 벗겨 앱 서버는 루트 기준 요청을
    // 받고, 앱은 APP_BASE_PATH 로 emit URL 에만 prefix. false: pass-through —
    // 앱 서버가 `/<cp>/...` 를 직접 서빙(base-path-aware 서버, 예: Next basePath).
    // optional + 서버측 기본 true.
    stripPrefix: z.boolean().optional(),
    // TASK-172 (v0.5.0): 호스팅 URL 스킴. "path"(기본) = `host/<cp>/`(APP_BASE_PATH
    // 규약), "subdomain" = `<cp>.host/`(앱 무수정, 루트 서빙 — sub-path 자산 제약
    // 없음, 단 wildcard DNS/TLS 필요). subdomain 은 stripPrefix 무관.
    hostingScheme: z.enum(hostingSchemes).optional(),
    // TASK-160 (P2-M1 Step 3): `previewTtlMinutes` 제거. preview 런타임의
    // 보존 시간 knob 이었으나 canonical build/test/deploy 모델에는 대응
    // 개념이 없고 실제로 소비되는 곳도 없었다.
    metadata: z.record(z.string(), z.string()).default({})
  })
  .meta({ id: "BuildRequest", description: "POST /builds payload (Skill → Host)." });

export type BuildRequest = z.infer<typeof buildRequestSchema>;


export const buildListQuerySchema = z
  .object({
    status: z
      .enum(buildStatuses)
      .optional()
      .meta({
        description:
          "Optional status filter. Accepts the canonical lifecycle statuses plus the temporary legacy adapter statuses still emitted by the preview-era implementation. Omitted = all."
      }),
    requestedBy: z
      .string()
      .min(1)
      .optional()
      .meta({
        description:
          "Optional owner filter. Matches BuildRequest.requestedBy (canonical owner identity, same as IDENTITY_MODEL userId). Omitted = all."
      }),
    limit: z
      .coerce
      .number()
      .int()
      .positive()
      .max(200)
      .default(50)
      .meta({
        description:
          "Maximum number of summaries to return. Server cap is 200. Default 50."
      }),
    cursor: z
      .string()
      .uuid()
      .optional()
      .meta({
        description:
          "Pagination cursor (buildId of the last item in the previous page). Omitted = first page."
      })
  })
  .meta({
    id: "BuildListQuery",
    description:
      "Query string for GET /builds. status and requestedBy filters are optional, limit is server-capped, cursor is opaque (buildId-based)."
  });

export type BuildListQuery = z.infer<typeof buildListQuerySchema>;
