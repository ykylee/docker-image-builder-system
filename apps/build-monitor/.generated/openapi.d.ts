export interface paths {
    "/builds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description List build summaries in createdAt-desc order with optional status filter and cursor pagination. */
        get: {
            parameters: {
                query?: {
                    /** @description Optional status filter. Matches the canonical BuildStatus enum. Omitted = all. */
                    status?: "QUEUED" | "BUILDING" | "COMPLETED" | "FAILED" | "PROVISIONING" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "TEST_READY" | "EXPIRED";
                    /** @description Optional owner filter. Matches BuildRequest.requestedBy (canonical owner identity, same as IDENTITY_MODEL userId). Omitted = all. */
                    requestedBy?: string;
                    /** @description Maximum number of summaries to return. Server cap is 200. Default 50. */
                    limit?: number;
                    /** @description Pagination cursor (buildId of the last item in the previous page). Omitted = first page. */
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Page of build summaries. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BuildListResponse"];
                    };
                };
            };
        };
        put?: never;
        /** @description Submit a new build request. Returns 202 with the new buildId, or 409 if a build for the same sourceArchive+tag is already in flight. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["BuildRequest"];
                };
            };
            responses: {
                /** @description Build accepted. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BuildAcceptedResponse"];
                    };
                };
                /** @description A matching build is already in flight. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BuildDuplicateResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Fetch current status, phases, and preview info for a build. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    buildId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Build status. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BuildStatusResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Append log entries since the cursor and report the latest cursor. */
        get: {
            parameters: {
                query?: {
                    since?: string;
                };
                header?: never;
                path: {
                    buildId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Logs batch. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BuildLogsResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/claim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Runner long-poll: claim the next pending build. 204 if no work. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ClaimRequest"];
                };
            };
            responses: {
                /** @description Claimed build. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ClaimResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/phase": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Runner reports a phase transition (DOCKER_BUILD_STARTED, COMPLETED, FAILED, ...). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    buildId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["PhaseUpdateRequest"];
                };
            };
            responses: {
                /** @description Phase updated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Queue a test deployment once the build reaches DOCKER_BUILD_COMPLETED. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    buildId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["TestDeploymentQueueRequest"];
                };
            };
            responses: {
                /** @description Preview queued. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TestDeploymentQueueResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/test-deployment/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Runner reports the preview is reachable. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    buildId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["TestDeploymentReadyRequest"];
                };
            };
            responses: {
                /** @description Preview marked ready. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/test-deployment/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Runner reports general preview status (PROVISIONING, FAILED, EXPIRED). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    buildId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["TestDeploymentStatusRequest"];
                };
            };
            responses: {
                /** @description Status recorded. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/test-deployment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Fetch the current test deployment record for a build (if any). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    buildId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Test deployment present. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TestDeployment"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Liveness probe. Always 200 with `{ status: "ok" }`. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Service is alive. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/builds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Admin-only. List build summaries across all owners. Requires the X-Admin-Id header to be in the build-server ADMIN_IDS env. */
        get: {
            parameters: {
                query?: {
                    /** @description Optional status filter. Matches the canonical BuildStatus enum. Omitted = all. */
                    status?: "QUEUED" | "BUILDING" | "COMPLETED" | "FAILED" | "PROVISIONING" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "TEST_READY" | "EXPIRED";
                    /** @description Admin-only optional owner filter. Omitted = every owner. Caller id must be in ADMIN_IDS. */
                    requestedBy?: string;
                    /** @description Maximum number of summaries to return. Server cap is 200. Default 50. */
                    limit?: number;
                    /** @description Pagination cursor (buildId of the last item in the previous page). Omitted = first page. */
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Page of build summaries across all owners. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminListBuildsResponse"];
                    };
                };
                /** @description X-Admin-Id header missing. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Caller is not in the admin allow-list. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Admin-only. List userIds that have build history with per-user buildCount and lastBuildAt. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Owner rollup. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminUserListResponse"];
                    };
                };
                /** @description X-Admin-Id header missing. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Caller is not in the admin allow-list. */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Standard error shape returned with 4xx/5xx responses. */
        BuildError: {
            /** @enum {string} */
            code: "ACTIVE_BUILD_EXISTS" | "INVALID_REQUEST" | "BUILD_NOT_FOUND" | "LOGS_NOT_FOUND" | "QUEUE_CLAIM_FAILED" | "DOCKER_BUILD_FAILED" | "PREVIEW_PROVISION_FAILED" | "UNKNOWN_ERROR";
            message: string;
        };
        /** @description Returned on POST /builds when a new build is queued (HTTP 202). */
        BuildAcceptedResponse: {
            /** @enum {boolean} */
            accepted: true;
            /** @enum {boolean} */
            duplicate: false;
            build: components["schemas"]["BuildSummary"];
        };
        /** @description Compact build snapshot returned in intake, status, claim, and preview responses. */
        BuildSummary: {
            /** Format: uuid */
            buildId: string;
            /**
             * @description Canonical application name (BuildRequest.appName). One identifier per build, used as the active-build lock key and rendered in the UI.
             */
            appName: string;
            /** @enum {string} */
            status: "QUEUED" | "CLAIMED" | "BUILDING" | "TEST_READY" | "COMPLETED" | "FAILED";
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "COMPLETED" | "FAILED";
            /** @enum {string} */
            previewStatus: "NOT_REQUESTED" | "QUEUED" | "PROVISIONING" | "READY" | "FAILED" | "EXPIRED";
            /** Format: uri */
            previewUrl: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description Returned on POST /builds when an active build already exists for the same appName (HTTP 409, not 4xx error). */
        BuildDuplicateResponse: {
            /** @enum {boolean} */
            accepted: false;
            /** @enum {boolean} */
            duplicate: true;
            /** @enum {string} */
            reason: "ACTIVE_BUILD_EXISTS";
            build: components["schemas"]["BuildSummary"];
        };
        /** @description Query string for GET /builds. status and requestedBy filters are optional, limit is server-capped, cursor is opaque (buildId-based). */
        BuildListQuery: {
            /**
             * @description Optional status filter. Matches the canonical BuildStatus enum. Omitted = all.
             * @enum {string}
             */
            status?: "QUEUED" | "BUILDING" | "COMPLETED" | "FAILED" | "PROVISIONING" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "TEST_READY" | "EXPIRED";
            /** @description Optional owner filter. Matches BuildRequest.requestedBy (canonical owner identity, same as IDENTITY_MODEL userId). Omitted = all. */
            requestedBy?: string;
            /**
             * @description Maximum number of summaries to return. Server cap is 200. Default 50.
             * @default 50
             */
            limit: number;
            /**
             * Format: uuid
             * @description Pagination cursor (buildId of the last item in the previous page). Omitted = first page.
             */
            cursor?: string;
        };
        /** @description Page of build summaries returned by GET /builds. nextCursor is null when the caller has reached the end. */
        BuildListResponse: {
            builds: components["schemas"]["BuildSummary"][];
            /**
             * Format: uuid
             * @description Cursor to fetch the next page (buildId of the last item in this page). null = no more pages.
             */
            nextCursor: string | null;
        };
        /** @description Returned on GET /builds/:buildId and embedded in claim responses (2-depth nesting). */
        BuildStatusResponse: {
            build: components["schemas"]["BuildSummary"];
            lastError: components["schemas"]["BuildError"] & unknown;
        };
        /** @description Returned on GET /builds/:buildId/logs. */
        BuildLogsResponse: {
            /** Format: uuid */
            buildId: string;
            logs: components["schemas"]["BuildLogEntry"][];
        };
        /** @description Single append-only log line. */
        BuildLogEntry: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            buildId: string;
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "COMPLETED" | "FAILED";
            message: string;
            /** Format: date-time */
            createdAt: string;
        };
        /** @description Runner claim poll payload (PKG-005). */
        ClaimRequest: {
            runnerId: string;
            /** @default [] */
            capabilities: string[];
        };
        /** @description Runner claim poll response. When claimed=true, build is a 2-depth BuildStatusResponse. */
        ClaimResponse: {
            claimed: boolean;
            build: components["schemas"]["BuildStatusResponse"] & unknown;
            /** @enum {string|null} */
            reason: "NO_BUILD_AVAILABLE" | "ACTIVE_BUILD_EXISTS" | "QUEUE_CLAIM_FAILED" | null;
        };
        /** @description Runner phase report payload (PKG-005). */
        PhaseUpdateRequest: {
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "COMPLETED" | "FAILED";
            runnerId: string;
            /** Format: date-time */
            occurredAt?: string;
        };
        /** @description Preview service state. Returned in BuildStatusResponse.testDeployment (PKG-006). */
        TestDeployment: {
            /** @enum {string} */
            status: "NOT_REQUESTED" | "QUEUED" | "PROVISIONING" | "READY" | "FAILED" | "EXPIRED";
            /** Format: uri */
            previewUrl: string | null;
            host: string | null;
            hostPort: number | null;
            internalPort: number | null;
            /** Format: date-time */
            expiresAt: string | null;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @description POST /builds/:buildId/preview payload (Runner → Host). */
        TestDeploymentQueueRequest: {
            internalPort: number;
            /** @default 60 */
            ttlMinutes: number;
            runnerId: string;
        };
        /** @description POST /builds/:buildId/preview response (HTTP 202). */
        TestDeploymentQueueResponse: {
            testDeployment: components["schemas"]["TestDeployment"];
        };
        /** @description POST /builds/:buildId/test-deployment/ready payload (Runner → Host). */
        TestDeploymentReadyRequest: {
            /** Format: uri */
            previewUrl: string;
            host: string;
            hostPort: number;
            runnerId: string;
        };
        /** @description POST /builds/:buildId/test-deployment/status payload (Runner → Host, PROVISIONING/FAILED/EXPIRED). */
        TestDeploymentStatusRequest: {
            /** @enum {string} */
            status: "PROVISIONING" | "READY" | "FAILED" | "EXPIRED";
            runnerId: string;
        };
        /** @description Source archive reference uploaded by the Skill before build request. */
        SourceArchive: {
            objectKey: string;
            checksumSha256: string;
            sizeBytes: number;
        };
        /** @description POST /builds payload (Skill → Host). */
        BuildRequest: {
            /**
             * @description Canonical application name. Used as the active-build deduplication key and rendered in the build list/detail UI.
             */
            appName: string;
            requestedBy: string;
            sourceArchive: components["schemas"]["SourceArchive"];
            entrypointPath: string;
            /** @default Dockerfile */
            dockerfilePath: string;
            /** @default 60 */
            previewTtlMinutes: number;
            /** @default {} */
            metadata: {
                [key: string]: string;
            };
        };
        /** @description Query for GET /admin/builds. Same shape as BuildListQuery but the requestedBy filter is unrestricted (admin can filter by any owner or omit to see all). */
        AdminListBuildsQuery: {
            /**
             * @description Optional status filter. Matches the canonical BuildStatus enum. Omitted = all.
             * @enum {string}
             */
            status?: "QUEUED" | "BUILDING" | "COMPLETED" | "FAILED" | "PROVISIONING" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "TEST_READY" | "EXPIRED";
            /** @description Admin-only optional owner filter. Omitted = every owner. Caller id must be in ADMIN_IDS. */
            requestedBy?: string;
            /**
             * @description Maximum number of summaries to return. Server cap is 200. Default 50.
             * @default 50
             */
            limit: number;
            /**
             * Format: uuid
             * @description Pagination cursor (buildId of the last item in the previous page). Omitted = first page.
             */
            cursor?: string;
        };
        /** @description Page of AdminUserBuildSummary entries returned by GET /admin/builds. Each summary carries the owner key in addition to the canonical BuildSummary fields. */
        AdminListBuildsResponse: {
            builds: components["schemas"]["AdminUserBuildSummary"][];
            /**
             * Format: uuid
             * @description Cursor to fetch the next page (buildId of the last item in this page). null = no more pages.
             */
            nextCursor: string | null;
        };
        /** @description Build summary enriched with the owner key. Returned by GET /admin/builds so the admin UI can render the owner column without an extra lookup. */
        AdminUserBuildSummary: {
            /** Format: uuid */
            buildId: string;
            /**
             * @description Canonical application name (BuildRequest.appName). One identifier per build, used as the active-build lock key and rendered in the UI.
             */
            appName: string;
            /** @enum {string} */
            status: "QUEUED" | "CLAIMED" | "BUILDING" | "TEST_READY" | "COMPLETED" | "FAILED";
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "PREVIEW_QUEUED" | "PREVIEW_READY" | "COMPLETED" | "FAILED";
            /** @enum {string} */
            previewStatus: "NOT_REQUESTED" | "QUEUED" | "PROVISIONING" | "READY" | "FAILED" | "EXPIRED";
            /** Format: uri */
            previewUrl: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** @description Canonical owner key (BuildRequest.requestedBy). Included on admin views because the caller may be a different identity from the build owner. */
            requestedBy: string;
        };
        /** @description Response body for GET /admin/users. */
        AdminUserListResponse: {
            users: components["schemas"]["AdminUserSummary"][];
        };
        /** @description Per-owner rollup for the admin user list. One row per distinct requestedBy value in build history. */
        AdminUserSummary: {
            /** @description Canonical owner key from BuildRequest.requestedBy. Same canonical key as IDENTITY_MODEL userId. */
            userId: string;
            /** @description Total number of builds submitted by this userId. */
            buildCount: number;
            /**
             * Format: date-time
             * @description createdAt of the user's most recent build. null when the user has no builds (should not normally appear in this list).
             */
            lastBuildAt: string | null;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
