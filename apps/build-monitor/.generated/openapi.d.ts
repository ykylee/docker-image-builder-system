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
                    /** @description Optional status filter. Accepts the canonical lifecycle statuses plus the temporary legacy adapter statuses still emitted by the preview-era implementation. Omitted = all. */
                    status?: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
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
    "/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description List hosted services owned by the requesting user. */
        get: {
            parameters: {
                query?: never;
                header: {
                    "x-user-id": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Hosted services owned by the requesting user. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HostedServiceListResponse"];
                    };
                };
                /** @description X-User-Id header missing. */
                401: {
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
    "/builds/{buildId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Fetch current status, phases, and canonical build/test/deploy blocks for a build. */
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
    "/builds/{buildId}/container-test/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Start the container test once the image build completes (TASK-161: was POST /builds/{buildId}/preview). */
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
                    "application/json": components["schemas"]["ContainerTestStartRequest"];
                };
            };
            responses: {
                /** @description Container test started. Response carries the canonical BuildStatusResponse. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BuildStatusResponse"];
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
    "/builds/{buildId}/container-test/result": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Runner reports container test progress/result (TASK-161: absorbs the former test-deployment/ready and test-deployment/status endpoints). */
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
                    "application/json": components["schemas"]["ContainerTestResultRequest"];
                };
            };
            responses: {
                /** @description Container test result recorded. Response carries the canonical BuildStatusResponse with the just-updated `test` block. */
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
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/deployment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Runner reports external deployment progress and final result. */
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
                    "application/json": components["schemas"]["DeploymentReportRequest"];
                };
            };
            responses: {
                /** @description Deployment state recorded. Response carries the canonical BuildStatusResponse with the just-updated `deploy` and `resultDelivery` blocks. */
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
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/builds/{buildId}/source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Download the raw source archive bytes for a build. Response is application/octet-stream; the SHA-256 is surfaced in the `X-Source-Checksum-Sha256` response header and the byte count in `X-Source-Size-Bytes`. */
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
                /** @description Source archive bytes. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/octet-stream": string;
                    };
                };
                /** @description Build or source archive not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        /** @description Upload the raw source archive bytes for a build. Body is application/octet-stream; the server recomputes the SHA-256 and size and refuses the upload if they do not match the build's `sourceArchive` metadata. The Skill is expected to call this after `POST /builds` has succeeded. */
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
                    "application/octet-stream": string;
                };
            };
            responses: {
                /** @description Source archive accepted and verified. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SourceArchiveUploadResponse"];
                    };
                };
                /** @description Checksum or size mismatch (recomputed from body). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Build not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /** @description Delete the stored source archive bytes for a build. Returns 204 on success and 404 when the build itself is unknown. The declared `sourceArchive` metadata on the build row is preserved. */
        delete: {
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
                /** @description Source archive dropped. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Build not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
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
                    /** @description Optional status filter. Accepts the canonical lifecycle statuses plus the temporary legacy adapter statuses still emitted by the preview-era implementation. Omitted = all. */
                    status?: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
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
    "/admin/hosting-capacity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Admin-only. Return aggregate CPU/memory capacity, active reservations, remaining capacity, and theoretical density for each hosting tier. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Current hosting capacity snapshot. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HostingCapacityResponse"];
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
    "/admin/hosted-services/{appName}/manifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Admin-only. Return the current canonical service manifest. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    appName: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Current manifest. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceManifestResponse"];
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
                /** @description Manifest not found. */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /** @description Admin-only. Validate and save a new immutable service manifest revision. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    appName: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ServiceManifest"];
                };
            };
            responses: {
                /** @description Manifest revision saved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceManifestResponse"];
                    };
                };
                /** @description Invalid manifest. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
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
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/hosted-services/{appName}/database": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Admin-only. Return service database provisioning and migration status without credentials. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    appName: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Service database status. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceDatabaseStatus"];
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
                /** @description Service database not found. */
                404: {
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
    "/admin/hosted-services/{appName}/database/purge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Admin-only. Permanently delete the service Secret, schema, role, and metadata after exact appName confirmation. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    appName: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ServiceDatabasePurgeRequest"];
                };
            };
            responses: {
                /** @description Service database purged. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceDatabasePurgeResponse"];
                    };
                };
                /** @description Confirmation does not match appName. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
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
                /** @description Service database not found. */
                404: {
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
    "/admin/hosted-services/{appName}/database/rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Admin-only. Rotate the service role password and Kubernetes Secret after exact appName confirmation. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    appName: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["ServiceDatabaseRotationRequest"];
                };
            };
            responses: {
                /** @description Service database rotated. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceDatabaseStatus"];
                    };
                };
                /** @description Confirmation does not match appName. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
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
                /** @description Service database not found. */
                404: {
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
    "/admin/hosted-services/{appName}/manifest/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Admin-only. List immutable manifest revisions, newest first. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    appName: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Manifest revision history. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceManifestRevisionListResponse"];
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
    "/admin/runners": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Admin-only. List every registered runner (ACTIVE + DISABLED) sorted by runnerId. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Snapshot of the runner registry. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminRunnerListResponse"];
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
        /** @description Admin-only. Pre-register a runner record so the admin can see it in the registry before the runner process boots. The runner record starts as ACTIVE with zero counters; once the runner actually starts and self-registers on its first claim, the existing self-register refreshes lastSeenAt without changing status. Idempotent at the storage level (ON CONFLICT DO NOTHING), but a duplicate runnerId returns 409 so the admin UI can surface the misconfiguration. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["AdminRunnerRegisterRequest"];
                };
            };
            responses: {
                /** @description Runner pre-registered (record created). */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminRunnerRegisterResponse"];
                    };
                };
                /** @description Invalid body (empty runnerId, extra fields, type mismatch). */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
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
                /** @description Runner already registered (duplicate runnerId). */
                409: {
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
    "/admin/runners/{runnerId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Admin-only. Permanently remove a runner from the registry. Idempotent — unknown runner id still returns 200 with removedRunnerId echoed back so the admin UI can clear stale entries. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    runnerId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Removed (or already absent). */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminRunnerDeleteResponse"];
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
        options?: never;
        head?: never;
        /** @description Admin-only. Toggle a runner's status (DISABLED blocks future claims, ACTIVE re-enables). 404 for an unknown runner id (no prior claim seen). */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    runnerId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["AdminRunnerPatchRequest"];
                };
            };
            responses: {
                /** @description Status toggled. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AdminRunnerPatchResponse"];
                    };
                };
                /** @description Invalid status value or empty runnerId. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
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
                /** @description Runner id has not yet registered (no claim observed). */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Standard error shape returned with 4xx/5xx responses. */
        BuildError: {
            /** @enum {string} */
            code: "ACTIVE_BUILD_EXISTS" | "INVALID_REQUEST" | "BUILD_NOT_FOUND" | "LOGS_NOT_FOUND" | "QUEUE_CLAIM_FAILED" | "DOCKER_BUILD_FAILED" | "CONTAINER_TEST_FAILED" | "DEPLOYMENT_FAILED" | "CONTEXT_PATH_TAKEN" | "HOSTING_TIER_UPGRADE_REQUIRED" | "HOSTING_RESOURCE_LIMIT_EXCEEDED" | "HOSTING_CAPACITY_EXCEEDED" | "UNKNOWN_ERROR";
            message: string;
        };
        /** @description BuildError or null. null = 이 빌드에 기록된 실패 이유가 없음 (TASK-162 이전에는 항상 null 이었다). */
        NullableBuildError: {
            /** @enum {string} */
            code: "ACTIVE_BUILD_EXISTS" | "INVALID_REQUEST" | "BUILD_NOT_FOUND" | "LOGS_NOT_FOUND" | "QUEUE_CLAIM_FAILED" | "DOCKER_BUILD_FAILED" | "CONTAINER_TEST_FAILED" | "DEPLOYMENT_FAILED" | "CONTEXT_PATH_TAKEN" | "HOSTING_TIER_UPGRADE_REQUIRED" | "HOSTING_RESOURCE_LIMIT_EXCEEDED" | "HOSTING_CAPACITY_EXCEEDED" | "UNKNOWN_ERROR";
            message: string;
        } | null;
        /** @description One field-level validation failure. Mirrors a zod issue narrowed to the fields the API contract guarantees. */
        ApiErrorIssue: {
            /** @description Field path of the failing value (dot-joinable). */
            path: (string | number)[];
            /** @description Human-readable reason. */
            message: string;
            /** @description zod issue code, when present. */
            code?: string;
        } & {
            [key: string]: unknown;
        };
        /** @description Canonical error envelope for 4xx responses. `issues` is populated on schema-validation failures so clients can render field-level errors. */
        ApiErrorResponse: {
            /** @description Human-readable summary. Always present. */
            message: string;
            /** @description Field-level validation failures. Present when the request failed schema validation (HTTP 400). */
            issues?: components["schemas"]["ApiErrorIssue"][];
        } & {
            [key: string]: unknown;
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
            /** @description Canonical application name (BuildRequest.appName). One identifier per build, used as the active-build lock key and rendered in the UI. */
            appName: string;
            /**
             * @description Current top-level build status (canonical lifecycle). TASK-159 에서 legacy adapter status(CLAIMED/TEST_READY)를 제거해 canonical 과 동일해졌다.
             * @enum {string}
             */
            status: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "CONTAINER_TEST_STARTED" | "CONTAINER_TEST_PASSED" | "DEPLOYMENT_STARTED" | "DEPLOYMENT_COMPLETED" | "COMPLETED" | "RESULT_DELIVERY_STARTED" | "RESULT_DELIVERED" | "FAILED";
            /**
             * Format: uri
             * @description Public hosted runtime URL, populated only after a successful hosted deployment. Internal container-test addresses are not exposed here.
             */
            runtimeUrl: string | null;
            /** @description Allocated hosting context path (URL prefix). Null on pre-hosting builds. */
            contextPath?: string | null;
            /** @description App container listen port used by hosting Service/Ingress. Defaults to 8080. */
            runtimePort?: number;
            /** @description Whether the hosting Ingress strips the context-path prefix (default true). */
            stripPrefix?: boolean;
            /**
             * @description Hosting URL scheme: path (host/<cp>/) or subdomain (<cp>.host/). Default path.
             * @enum {string}
             */
            hostingScheme?: "path" | "subdomain";
            /** @enum {string} */
            effectiveTier?: "sandbox" | "standard" | "production";
            /** @enum {string} */
            serviceSize?: "small" | "medium" | "large";
            hostingPolicyVersion?: string;
            resources?: {
                cpuRequest: string;
                memoryRequest: string;
                cpuLimit: string;
                memoryLimit: string;
                replicas: number;
            };
            /** @enum {string} */
            dockerfileMode?: "required" | "auto";
            database?: {
                enabled: boolean;
                migrationCommand?: string;
            };
            /**
             * @description Canonical lifecycle status projected from the build/test/deploy pipeline model. Optional during the migration window.
             * @enum {string}
             */
            lifecycleStatus?: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
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
        /** @description Canonical build lifecycle snapshot aligned with the document-first build/test/deploy/result-delivery model. */
        BuildLifecycle: {
            /** @enum {string} */
            status: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
            /** Format: date-time */
            startedAt?: string | null;
            /** Format: date-time */
            finishedAt?: string | null;
        };
        /** @description The in-flight BuildPhase, or null when the build is in a terminal state. Mirrors build.phase + carry-over timestamp. */
        BuildCurrentPhase: {
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "CONTAINER_TEST_STARTED" | "CONTAINER_TEST_PASSED" | "DEPLOYMENT_STARTED" | "DEPLOYMENT_COMPLETED" | "COMPLETED" | "RESULT_DELIVERY_STARTED" | "RESULT_DELIVERED" | "FAILED";
            /**
             * Format: date-time
             * @description ISO 8601 timestamp at which the current in-flight phase began. Used by the build-monitor PhaseTimeline to render the "now" indicator.
             */
            startedAt: string;
        } | null;
        /** @description Image identity emitted after a successful docker build. Optional during the migration window. */
        BuildImage: {
            name: string;
            tag: string;
            digest: string | null;
        };
        /** @description Canonical container-test result block. Replaces preview-centric status interpretation for runtime validation. */
        ContainerTestResult: {
            /** @enum {string} */
            status: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "SKIPPED";
            containerRunning: boolean | null;
            healthCheckPassed: boolean | null;
            portOpen: boolean | null;
            stabilityWindowPassed: boolean | null;
        };
        /** @description POST /builds/:buildId/deployment payload (Runner → Host). Records external deployment progress and final result for the canonical deploy block. */
        DeploymentReportRequest: {
            /** @enum {string} */
            status: "IN_PROGRESS" | "SUCCESS" | "FAILED";
            /** @enum {string} */
            targetType: "HTTP_API" | "SCP" | "SFTP" | "SHARED_STORAGE" | "DOCKER_REGISTRY" | "K8S" | "OTHER";
            targetRef?: string | null;
            resultRef?: string | null;
            errorCode?: string | null;
            errorMessage?: string | null;
            contextPath?: string | null;
            namespace?: string | null;
            deploymentName?: string | null;
            /** Format: uri */
            runtimeUrl?: string | null;
            runnerId: string;
            responsePayloadJson?: {
                [key: string]: unknown;
            } | null;
        };
        /** @description Canonical external deployment result block. Will replace preview-ready handoff fields after the server migration. */
        DeploymentResult: {
            /** @enum {string} */
            status: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "SKIPPED";
            /** @enum {string|null} */
            targetType: "HTTP_API" | "SCP" | "SFTP" | "SHARED_STORAGE" | "DOCKER_REGISTRY" | "K8S" | "OTHER" | null;
            resultRef: string | null;
        };
        /** @description Result-delivery state for the final external notification or polling handoff. */
        ResultDelivery: {
            /** @enum {string} */
            status: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "SKIPPED";
            /** @enum {string|null} */
            mode: "POLLING" | "NOTIFICATION" | null;
            /** Format: date-time */
            deliveredAt: string | null;
        };
        /** @description Query string for GET /builds. status and requestedBy filters are optional, limit is server-capped, cursor is opaque (buildId-based). */
        BuildListQuery: {
            /**
             * @description Optional status filter. Accepts the canonical lifecycle statuses plus the temporary legacy adapter statuses still emitted by the preview-era implementation. Omitted = all.
             * @enum {string}
             */
            status?: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
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
        /** @description Returned on GET /builds/:buildId and embedded in claim responses (2-depth nesting). phaseHistory + currentPhase preserve the existing timeline contract, while lifecycle/image/test/deploy/resultDelivery provide the new canonical build/test/deploy/result-delivery model. */
        BuildStatusResponse: {
            build: components["schemas"]["BuildSummary"];
            lastError: components["schemas"]["NullableBuildError"];
            /**
             * @description List of completed phase transitions in chronological order. Excludes the current in-flight phase (see currentPhase). Excludes phases that were skipped (e.g. CONTAINER_TEST_STARTED → COMPLETED without CONTAINER_TEST_PASSED). Empty when the build is still at REQUEST_ACCEPTED and has not transitioned yet. Defaulted to [] when not provided (e.g. by code paths that do not yet track transitions — see TASK-051).
             * @default []
             */
            phaseHistory: components["schemas"]["BuildPhaseHistoryEntry"][];
            currentPhase?: components["schemas"]["BuildCurrentPhase"];
            /** @description Canonical lifecycle snapshot. Optional during the migration window while the server still emits preview-era top-level statuses. */
            lifecycle?: {
                /** @enum {string} */
                status: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
                /** Format: date-time */
                startedAt?: string | null;
                /** Format: date-time */
                finishedAt?: string | null;
            };
            /** @description Canonical build artifact identity. Optional until docker build metadata is persisted by the server. */
            image?: {
                name: string;
                tag: string;
                digest: string | null;
            } | null;
            /** @description Canonical container-test result block. Optional until TASK-054 wires runtime validation results into the API. */
            test?: {
                /** @enum {string} */
                status: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "SKIPPED";
                containerRunning: boolean | null;
                healthCheckPassed: boolean | null;
                portOpen: boolean | null;
                stabilityWindowPassed: boolean | null;
            };
            /** @description Canonical external deployment result block. Optional until the deployment adapter is connected. */
            deploy?: {
                /** @enum {string} */
                status: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "SKIPPED";
                /** @enum {string|null} */
                targetType: "HTTP_API" | "SCP" | "SFTP" | "SHARED_STORAGE" | "DOCKER_REGISTRY" | "K8S" | "OTHER" | null;
                resultRef: string | null;
            };
            /** @description Canonical result-delivery block for polling/notification completion. Optional until final handoff tracking is implemented. */
            resultDelivery?: {
                /** @enum {string} */
                status: "NOT_STARTED" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "SKIPPED";
                /** @enum {string|null} */
                mode: "POLLING" | "NOTIFICATION" | null;
                /** Format: date-time */
                deliveredAt: string | null;
            };
        };
        /** @description Single completed-phase record. Appended in transition order. The current in-flight phase is not represented here — see BuildCurrentPhase. */
        BuildPhaseHistoryEntry: {
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "CONTAINER_TEST_STARTED" | "CONTAINER_TEST_PASSED" | "DEPLOYMENT_STARTED" | "DEPLOYMENT_COMPLETED" | "COMPLETED" | "RESULT_DELIVERY_STARTED" | "RESULT_DELIVERED" | "FAILED";
            /**
             * Format: date-time
             * @description ISO 8601 timestamp at which this phase completed (transitioned out, regardless of outcome).
             */
            completedAt: string;
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
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "CONTAINER_TEST_STARTED" | "CONTAINER_TEST_PASSED" | "DEPLOYMENT_STARTED" | "DEPLOYMENT_COMPLETED" | "COMPLETED" | "RESULT_DELIVERY_STARTED" | "RESULT_DELIVERED" | "FAILED";
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
            reason: "NO_BUILD_AVAILABLE" | "ACTIVE_BUILD_EXISTS" | "QUEUE_CLAIM_FAILED" | "RUNNER_DISABLED" | "RUNNER_ID_REQUIRED" | null;
        };
        /** @description Runner phase report payload (PKG-005). FAILED phase 는 errorCode/errorMessage 로 실패 이유를 함께 보고한다 (TASK-162). */
        PhaseUpdateRequest: {
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "CONTAINER_TEST_STARTED" | "CONTAINER_TEST_PASSED" | "DEPLOYMENT_STARTED" | "DEPLOYMENT_COMPLETED" | "COMPLETED" | "RESULT_DELIVERY_STARTED" | "RESULT_DELIVERED" | "FAILED";
            runnerId: string;
            /** Format: date-time */
            occurredAt?: string;
            /** @enum {string} */
            errorCode?: "ACTIVE_BUILD_EXISTS" | "INVALID_REQUEST" | "BUILD_NOT_FOUND" | "LOGS_NOT_FOUND" | "QUEUE_CLAIM_FAILED" | "DOCKER_BUILD_FAILED" | "CONTAINER_TEST_FAILED" | "DEPLOYMENT_FAILED" | "CONTEXT_PATH_TAKEN" | "HOSTING_TIER_UPGRADE_REQUIRED" | "HOSTING_RESOURCE_LIMIT_EXCEEDED" | "HOSTING_CAPACITY_EXCEEDED" | "UNKNOWN_ERROR";
            errorMessage?: string;
        };
        /** @description POST /builds/:buildId/container-test/start payload (Runner → Host). 컨테이너 테스트 시작을 알린다. preview-era 의 ttlMinutes 는 canonical 모델에 대응 개념이 없어 제거됐다. */
        ContainerTestStartRequest: {
            internalPort: number;
            runnerId: string;
        };
        /** @description POST /builds/:buildId/container-test/result payload (Runner → Host). 진행/성공/실패를 하나의 엔드포인트로 보고한다 (구 ready + status 통합). */
        ContainerTestResultRequest: {
            /** @enum {string} */
            status: "IN_PROGRESS" | "SUCCESS" | "FAILED";
            /** Format: uri */
            runtimeUrl?: string | null;
            host?: string | null;
            hostPort?: number | null;
            containerRef?: string;
            healthCheckPassed?: boolean;
            portOpen?: boolean;
            stabilityWindowPassed?: boolean;
            /** @enum {string} */
            errorCode?: "ACTIVE_BUILD_EXISTS" | "INVALID_REQUEST" | "BUILD_NOT_FOUND" | "LOGS_NOT_FOUND" | "QUEUE_CLAIM_FAILED" | "DOCKER_BUILD_FAILED" | "CONTAINER_TEST_FAILED" | "DEPLOYMENT_FAILED" | "CONTEXT_PATH_TAKEN" | "HOSTING_TIER_UPGRADE_REQUIRED" | "HOSTING_RESOURCE_LIMIT_EXCEEDED" | "HOSTING_CAPACITY_EXCEEDED" | "UNKNOWN_ERROR";
            errorMessage?: string;
            runnerId: string;
        };
        /** @description Source archive reference uploaded by the Skill before build request. */
        SourceArchive: {
            objectKey: string;
            checksumSha256: string;
            sizeBytes: number;
        };
        /** @description Response body for POST /builds/{buildId}/source. The server echoes the recomputed SHA-256 and observed size after accepting the upload. */
        SourceArchiveUploadResponse: {
            /** Format: uuid */
            buildId: string;
            checksumSha256: string;
            sizeBytes: number;
        };
        /** @description POST /builds payload (Skill → Host). */
        BuildRequest: {
            /** @description Canonical application name. Used as the active-build deduplication key and rendered in the build list/detail UI. */
            appName: string;
            requestedBy: string;
            sourceArchive: components["schemas"]["SourceArchive"];
            entrypointPath: string;
            /** @default Dockerfile */
            dockerfilePath: string;
            /**
             * @default required
             * @enum {string}
             */
            dockerfileMode: "required" | "auto";
            /** @description Deprecated hosting URL context path. The server derives the path from appName and ignores this field. */
            contextPath?: string;
            runtimePort?: number;
            stripPrefix?: boolean;
            /** @enum {string} */
            hostingScheme?: "path" | "subdomain";
            /** @enum {string} */
            serviceSize?: "small" | "medium" | "large";
            /** @enum {string} */
            requestedTier?: "sandbox" | "standard" | "production";
            resources?: {
                cpuRequest?: string;
                memoryRequest?: string;
                cpuLimit?: string;
                memoryLimit?: string;
                replicas?: number;
            };
            /** @default {} */
            metadata: {
                [key: string]: string;
            };
        };
        /** @description Query for GET /admin/builds. Same shape as BuildListQuery but the requestedBy filter is unrestricted (admin can filter by any owner or omit to see all). */
        AdminListBuildsQuery: {
            /**
             * @description Optional status filter. Accepts the canonical lifecycle statuses plus the temporary legacy adapter statuses still emitted by the preview-era implementation. Omitted = all.
             * @enum {string}
             */
            status?: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
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
            /** @description Canonical application name (BuildRequest.appName). One identifier per build, used as the active-build lock key and rendered in the UI. */
            appName: string;
            /**
             * @description Current top-level build status (canonical lifecycle). TASK-159 에서 legacy adapter status(CLAIMED/TEST_READY)를 제거해 canonical 과 동일해졌다.
             * @enum {string}
             */
            status: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
            /** @enum {string} */
            phase: "REQUEST_ACCEPTED" | "QUEUE_CLAIMED" | "SOURCE_PREPARED" | "DOCKER_BUILD_STARTED" | "DOCKER_BUILD_COMPLETED" | "CONTAINER_TEST_STARTED" | "CONTAINER_TEST_PASSED" | "DEPLOYMENT_STARTED" | "DEPLOYMENT_COMPLETED" | "COMPLETED" | "RESULT_DELIVERY_STARTED" | "RESULT_DELIVERED" | "FAILED";
            /**
             * Format: uri
             * @description Public hosted runtime URL, populated only after a successful hosted deployment. Internal container-test addresses are not exposed here.
             */
            runtimeUrl: string | null;
            /** @description Allocated hosting context path (URL prefix). Null on pre-hosting builds. */
            contextPath?: string | null;
            /** @description App container listen port used by hosting Service/Ingress. Defaults to 8080. */
            runtimePort?: number;
            /** @description Whether the hosting Ingress strips the context-path prefix (default true). */
            stripPrefix?: boolean;
            /**
             * @description Hosting URL scheme: path (host/<cp>/) or subdomain (<cp>.host/). Default path.
             * @enum {string}
             */
            hostingScheme?: "path" | "subdomain";
            /** @enum {string} */
            effectiveTier?: "sandbox" | "standard" | "production";
            /** @enum {string} */
            serviceSize?: "small" | "medium" | "large";
            hostingPolicyVersion?: string;
            resources?: {
                cpuRequest: string;
                memoryRequest: string;
                cpuLimit: string;
                memoryLimit: string;
                replicas: number;
            };
            /** @enum {string} */
            dockerfileMode?: "required" | "auto";
            database?: {
                enabled: boolean;
                migrationCommand?: string;
            };
            /**
             * @description Canonical lifecycle status projected from the build/test/deploy pipeline model. Optional during the migration window.
             * @enum {string}
             */
            lifecycleStatus?: "RECEIVED" | "QUEUED" | "PREPARING_SOURCE" | "BUILDING" | "BUILD_SUCCESS" | "TESTING" | "TEST_SUCCESS" | "DEPLOYING" | "DEPLOY_SUCCESS" | "COMPLETED" | "FAILED" | "CANCELLED";
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
        /** @description Admin view of a runner. Returned by GET /admin/runners and GET /admin/runners/:runnerId. `currentBuildId` is the most recent claim that has not yet transitioned to a terminal phase. */
        AdminRunner: {
            /** @description Canonical runner id. Matches the `RUNNER_ID` env value the runner process booted with. Self-registers on first claim. */
            runnerId: string;
            status: components["schemas"]["RunnerStatus"];
            /**
             * Format: date-time
             * @description ISO8601 timestamp of the first claim ever observed by the Build Server for this runner.
             */
            firstSeenAt: string;
            /**
             * Format: date-time
             * @description ISO8601 timestamp of the most recent claim/phase report from this runner.
             */
            lastSeenAt: string;
            /** @description Total number of builds claimed by this runner. */
            buildsClaimed: number;
            /** @description Total number of builds this runner reported `phase=DOCKER_BUILD_COMPLETED`. */
            buildsCompleted: number;
            /**
             * Format: uuid
             * @description The build id this runner most recently claimed and is still working on. null when the runner has not claimed a build or has finished the previous one.
             */
            currentBuildId: string | null;
            /** @description Last error message reported by this runner for the current claim (PHASE=FAILED reason). null when no error is recorded. */
            lastError: string | null;
        };
        /**
         * @description Lifecycle state of a registered runner. ACTIVE = accepting claims. DISABLED = admin-disabled; subsequent claims return reason=RUNNER_DISABLED and no build payload.
         * @enum {string}
         */
        RunnerStatus: "ACTIVE" | "DISABLED";
        /** @description Response body for GET /admin/runners. */
        AdminRunnerListResponse: {
            runners: components["schemas"]["AdminRunner"][];
        };
        /** @description Request body for PATCH /admin/runners/:runnerId. */
        AdminRunnerPatchRequest: {
            /**
             * @description New lifecycle state. DISABLED blocks future claims; ACTIVE re-enables.
             * @enum {string}
             */
            status: "ACTIVE" | "DISABLED";
        };
        /** @description Response body for PATCH /admin/runners/:runnerId. */
        AdminRunnerPatchResponse: {
            runner: components["schemas"]["AdminRunner"];
        };
        /** @description Response body for DELETE /admin/runners/:runnerId. */
        AdminRunnerDeleteResponse: {
            /** @description The runnerId that was just removed from the registry. */
            removedRunnerId: string;
        };
        /** @description Request body for POST /admin/runners. The runnerId must be unique within the registry (a duplicate returns 409). Status fields (buildsClaimed/currentBuildId/etc.) are not user-supplied — they are derived from the runner's own claim activity after the runner starts. */
        AdminRunnerRegisterRequest: {
            /** @description Canonical runner id. Must match the `RUNNER_ID` env the runner process boots with — otherwise its first claim will be rejected (mismatched-id). Pre-registration with the wrong id is a misconfiguration that the admin UI cannot auto-detect; the same is true for self-registration. */
            runnerId: string;
        };
        /** @description Response body for POST /admin/runners. */
        AdminRunnerRegisterResponse: {
            /** @description The freshly registered runner record. `status` is ACTIVE (admin can later PATCH to DISABLE), `firstSeenAt` and `lastSeenAt` are both set to the registration time (will be replaced by the runner's first claim timestamp). */
            runner: {
                /** @description Canonical runner id. Matches the `RUNNER_ID` env value the runner process booted with. Self-registers on first claim. */
                runnerId: string;
                status: components["schemas"]["RunnerStatus"];
                /**
                 * Format: date-time
                 * @description ISO8601 timestamp of the first claim ever observed by the Build Server for this runner.
                 */
                firstSeenAt: string;
                /**
                 * Format: date-time
                 * @description ISO8601 timestamp of the most recent claim/phase report from this runner.
                 */
                lastSeenAt: string;
                /** @description Total number of builds claimed by this runner. */
                buildsClaimed: number;
                /** @description Total number of builds this runner reported `phase=DOCKER_BUILD_COMPLETED`. */
                buildsCompleted: number;
                /**
                 * Format: uuid
                 * @description The build id this runner most recently claimed and is still working on. null when the runner has not claimed a build or has finished the previous one.
                 */
                currentBuildId: string | null;
                /** @description Last error message reported by this runner for the current claim (PHASE=FAILED reason). null when no error is recorded. */
                lastError: string | null;
            };
        };
        /** @description Admin view of aggregate hosting capacity, current reservations, and tier density estimates. */
        HostingCapacityResponse: {
            capacity: {
                cpuMillicores: number;
                memoryMi: number;
            };
            used: {
                cpuMillicores: number;
                memoryMi: number;
            };
            remaining: {
                cpuMillicores: number;
                memoryMi: number;
            };
            tiers: {
                sandbox: {
                    /** @enum {string} */
                    tier: "sandbox" | "standard" | "production";
                    cpuServices: number;
                    memoryServices: number;
                    maxServices: number;
                    perService: {
                        cpuMillicores: number;
                        memoryMi: number;
                        replicas: number;
                    };
                };
                standard: {
                    /** @enum {string} */
                    tier: "sandbox" | "standard" | "production";
                    cpuServices: number;
                    memoryServices: number;
                    maxServices: number;
                    perService: {
                        cpuMillicores: number;
                        memoryMi: number;
                        replicas: number;
                    };
                };
                production: {
                    /** @enum {string} */
                    tier: "sandbox" | "standard" | "production";
                    cpuServices: number;
                    memoryServices: number;
                    maxServices: number;
                    perService: {
                        cpuMillicores: number;
                        memoryMi: number;
                        replicas: number;
                    };
                };
            };
        };
        ServiceManifest: {
            /** @enum {number} */
            version: 1;
            service: {
                appName: string;
                image: {
                    repository: string;
                    tag: string;
                };
            };
            runtime: {
                /** @default 8080 */
                port: number;
                command?: string;
                /** @default /health */
                healthPath: string;
                /** @default APP_BASE_PATH */
                basePathEnv: string;
            };
            /**
             * @default {
             *       "enabled": false,
             *       "engine": "postgres"
             *     }
             */
            database: {
                /** @default false */
                enabled: boolean;
                /**
                 * @default postgres
                 * @enum {string}
                 */
                engine: "postgres";
                migrationCommand?: string;
            };
            hosting: {
                /**
                 * @default path
                 * @enum {string}
                 */
                scheme: "path" | "subdomain";
                contextPath: string;
                /** @default true */
                stripPrefix: boolean;
                /**
                 * @default sandbox
                 * @enum {string}
                 */
                tier: "sandbox" | "standard" | "production";
                /** @default 1 */
                replicas: number;
            };
            deployment: {
                /**
                 * @default kubectl
                 * @enum {string}
                 */
                adapter: "kubectl" | "helm" | "argocd";
                /** @default dib-hosted */
                namespace: string;
            };
        };
        ServiceManifestResponse: {
            appName: string;
            currentRevision: number;
            manifest: {
                /** @enum {number} */
                version: 1;
                service: {
                    appName: string;
                    image: {
                        repository: string;
                        tag: string;
                    };
                };
                runtime: {
                    /** @default 8080 */
                    port: number;
                    command?: string;
                    /** @default /health */
                    healthPath: string;
                    /** @default APP_BASE_PATH */
                    basePathEnv: string;
                };
                /**
                 * @default {
                 *       "enabled": false,
                 *       "engine": "postgres"
                 *     }
                 */
                database: {
                    /** @default false */
                    enabled: boolean;
                    /**
                     * @default postgres
                     * @enum {string}
                     */
                    engine: "postgres";
                    migrationCommand?: string;
                };
                hosting: {
                    /**
                     * @default path
                     * @enum {string}
                     */
                    scheme: "path" | "subdomain";
                    contextPath: string;
                    /** @default true */
                    stripPrefix: boolean;
                    /**
                     * @default sandbox
                     * @enum {string}
                     */
                    tier: "sandbox" | "standard" | "production";
                    /** @default 1 */
                    replicas: number;
                };
                deployment: {
                    /**
                     * @default kubectl
                     * @enum {string}
                     */
                    adapter: "kubectl" | "helm" | "argocd";
                    /** @default dib-hosted */
                    namespace: string;
                };
            };
            updatedBy: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ServiceManifestRevisionListResponse: {
            revisions: {
                revision: number;
                manifest: {
                    /** @enum {number} */
                    version: 1;
                    service: {
                        appName: string;
                        image: {
                            repository: string;
                            tag: string;
                        };
                    };
                    runtime: {
                        /** @default 8080 */
                        port: number;
                        command?: string;
                        /** @default /health */
                        healthPath: string;
                        /** @default APP_BASE_PATH */
                        basePathEnv: string;
                    };
                    /**
                     * @default {
                     *       "enabled": false,
                     *       "engine": "postgres"
                     *     }
                     */
                    database: {
                        /** @default false */
                        enabled: boolean;
                        /**
                         * @default postgres
                         * @enum {string}
                         */
                        engine: "postgres";
                        migrationCommand?: string;
                    };
                    hosting: {
                        /**
                         * @default path
                         * @enum {string}
                         */
                        scheme: "path" | "subdomain";
                        contextPath: string;
                        /** @default true */
                        stripPrefix: boolean;
                        /**
                         * @default sandbox
                         * @enum {string}
                         */
                        tier: "sandbox" | "standard" | "production";
                        /** @default 1 */
                        replicas: number;
                    };
                    deployment: {
                        /**
                         * @default kubectl
                         * @enum {string}
                         */
                        adapter: "kubectl" | "helm" | "argocd";
                        /** @default dib-hosted */
                        namespace: string;
                    };
                };
                updatedBy: string;
                /** Format: date-time */
                createdAt: string;
            }[];
        };
        ServiceDatabaseStatus: {
            appName: string;
            /** @enum {string} */
            engine: "postgres";
            schemaName: string;
            roleName: string;
            secretName: string;
            /** @enum {string} */
            status: "PROVISIONING" | "READY" | "FAILED";
            migrationCommand: string | null;
            migrationRevision: number | null;
            created: boolean;
        };
        /** @description GET /admin/hosted-services response. */
        HostedServiceListResponse: {
            services: components["schemas"]["HostedService"][];
        };
        /** @description A durable hosted service for one app (one active per app). Returned by the admin hosting management API. */
        HostedService: {
            appName: string;
            contextPath: string;
            namespace: string;
            deploymentName: string;
            containerPort: number;
            stripPrefix: boolean;
            /** @enum {string} */
            hostingScheme: "path" | "subdomain";
            /** @enum {string} */
            effectiveTier?: "sandbox" | "standard" | "production";
            /** @enum {string} */
            serviceSize?: "small" | "medium" | "large";
            hostingPolicyVersion?: string;
            resources?: {
                cpuRequest: string;
                memoryRequest: string;
                cpuLimit: string;
                memoryLimit: string;
                replicas: number;
            };
            /** @enum {string} */
            status: "PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED" | "REMOVED";
            /** Format: uri */
            url: string | null;
            /** Format: uuid */
            currentBuildId: string | null;
            imageRef: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** Format: date-time */
            lastDeployedAt: string | null;
            availableReplicas: number | null;
            /** Format: date-time */
            lastSyncedAt: string | null;
        };
        ServiceDatabasePurgeRequest: {
            confirmation: string;
        };
        ServiceDatabasePurgeResponse: {
            appName: string;
            schemaName: string;
            roleName: string;
            secretName: string;
            /** @enum {boolean} */
            purged: true;
        };
        ServiceDatabaseRotationRequest: {
            confirmation: string;
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
