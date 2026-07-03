import { z } from "zod";

import { buildListQuerySchema } from "./request.js";
import { buildListResponseSchema, buildSummarySchema } from "./response.js";

// ---------------------------------------------------------------------------
// Admin-side schemas (ADMIN-* task group).
//
// These extend the canonical user-facing builds query so that the admin UI
// can reuse the same cursor/limit/status machinery when scanning the entire
// build history across all owners. The admin endpoints deliberately do not
// filter by requestedBy at the service layer; the query keeps requestedBy
// as an optional owner filter so the admin UI can drill into one user's
// builds from the user list view.
//
// Note: the per-build response shape that the admin endpoints emit
// (AdminUserBuildSummary) extends BuildSummary with the canonical owner
// key. BuildSummary does not include requestedBy because the user-facing
// endpoints infer the owner from the caller. The admin endpoints widen
// the response so the admin UI can render the owner without an extra
// lookup.
// ---------------------------------------------------------------------------

// AdminUserBuildSummary = BuildSummary & { requestedBy: string }
// The shape is constructed by hand to keep zod v4's intersection stable
// (z.intersection of two objects with meta() does not preserve the
// emitted refId in @asteasolutions/zod-to-openapi 8.5). It mirrors
// BuildSummary field-for-field, adds requestedBy, and carries its own
// .meta({ id }) so it can be registered as a separate component.
export const adminUserBuildSummarySchema = buildSummarySchema
  .extend({
    requestedBy: z.string().min(1).meta({
      description:
        "Canonical owner key (BuildRequest.requestedBy). Included on admin views because the caller may be a different identity from the build owner."
    })
  })
  .meta({
    id: "AdminUserBuildSummary",
    description:
      "Build summary enriched with the owner key. Returned by GET /admin/builds so the admin UI can render the owner column without an extra lookup."
  });

export type AdminUserBuildSummary = z.infer<typeof adminUserBuildSummarySchema>;

// ---------------------------------------------------------------------------
// Admin-side schemas (ADMIN-* task group).
//
// These extend the canonical user-facing builds query so that the admin UI
// can reuse the same cursor/limit/status machinery when scanning the entire
// build history across all owners. The admin endpoints deliberately do not
// filter by requestedBy at the service layer; the query keeps requestedBy
// as an optional owner filter so the admin UI can drill into one user's
// builds from the user list view.
// ---------------------------------------------------------------------------

export const adminListBuildsQuerySchema = z
  .object({
    status: buildListQuerySchema.shape.status,
    requestedBy: buildListQuerySchema.shape.requestedBy.meta({
      description:
        "Admin-only optional owner filter. Omitted = every owner. Caller id must be in ADMIN_IDS."
    }),
    limit: buildListQuerySchema.shape.limit,
    cursor: buildListQuerySchema.shape.cursor
  })
  .meta({
    id: "AdminListBuildsQuery",
    description:
      "Query for GET /admin/builds. Same shape as BuildListQuery but the requestedBy filter is unrestricted (admin can filter by any owner or omit to see all)."
  });

export type AdminListBuildsQuery = z.infer<typeof adminListBuildsQuerySchema>;

export const adminListBuildsResponseSchema = z
  .object({
    builds: z.array(adminUserBuildSummarySchema),
    nextCursor: z
      .string()
      .uuid()
      .nullable()
      .meta({
        description:
          "Cursor to fetch the next page (buildId of the last item in this page). null = no more pages."
      })
  })
  .meta({
    id: "AdminListBuildsResponse",
    description:
      "Page of AdminUserBuildSummary entries returned by GET /admin/builds. Each summary carries the owner key in addition to the canonical BuildSummary fields."
  });

export type AdminListBuildsResponse = z.infer<typeof adminListBuildsResponseSchema>;

// Per-owner summary used by the admin user list. We derive lastBuildAt and
// buildCount from the existing build_request table at the repository layer;
// the schema only describes the response shape.
export const adminUserSummarySchema = z
  .object({
    userId: z.string().min(1).meta({
      description:
        "Canonical owner key from BuildRequest.requestedBy. Same canonical key as IDENTITY_MODEL userId."
    }),
    buildCount: z
      .int()
      .nonnegative()
      .meta({ description: "Total number of builds submitted by this userId." }),
    lastBuildAt: z
      .string()
      .datetime()
      .nullable()
      .meta({
        description:
          "createdAt of the user's most recent build. null when the user has no builds (should not normally appear in this list)."
      })
  })
  .meta({
    id: "AdminUserSummary",
    description:
      "Per-owner rollup for the admin user list. One row per distinct requestedBy value in build history."
  });

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserListResponseSchema = z
  .object({
    users: z.array(adminUserSummarySchema)
  })
  .meta({
    id: "AdminUserListResponse",
    description: "Response body for GET /admin/users."
  });

export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

// buildSummarySchema is re-exported indirectly through ./response.js; the
// admin list view reuses it. The imports above are intentionally limited
// to the schemas needed by the admin endpoints.
void buildSummarySchema;
