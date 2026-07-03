import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  adminAllowListAddRequestSchema,
  adminAllowListRemoveResponseSchema,
  adminAllowListResponseSchema,
  adminListBuildsQuerySchema,
  adminListBuildsResponseSchema,
  adminUserListResponseSchema
} from "@docker-image-builder-system/shared-contract";

import type { BuildService } from "../services/build-service.js";

// Admin guard (ADMIN-004, ADMIN-049). The admin allow-list is a mutable
// Set owned by the process and seeded from `runtime.adminIds` at boot.
// The guard and the list/add/remove helpers share the SAME Set reference
// so that mutations performed via POST /admin/admins / DELETE
// /admin/admins/:adminId are immediately visible to subsequent /admin/*
// requests inside the same process.
//
// Comparison rules: case-sensitive, matching the canonical userId semantics
// used elsewhere in the Build Server (BuildRequest.requestedBy and
// /builds?requestedBy= filter). Lowercase comparison would be more
// permissive, but it would break the round-trip through the build-monitor
// admin UI (Login.svelte stores the user-supplied value verbatim).
//
// Persistence: the canonical store for production is the ADMIN_IDS env
// variable. In-process mutations DO NOT persist across a restart. This is
// intentional at MVP scale — the admin UI is a local-only convenience
// and the env file is the source of truth that survives process churn.
// The first admin in the seeded list is conventionally retained (i.e.
// cannot be removed) so that the process always has at least one admin.
export interface AdminAllowList {
  /** Returns the canonical ordered list of admin ids. */
  list(): ReadonlyArray<string>;
  /** Returns true if `callerId` is in the allow-list. */
  contains(callerId: string | null | undefined): boolean;
  /** Appends `adminId` to the allow-list. No-op if already present. */
  add(adminId: string): void;
  /** Removes `adminId` from the allow-list. Returns true if removed. */
  remove(adminId: string): boolean;
  /**
   * Returns true if removing `adminId` would leave the allow-list empty.
   * The first admin in the seeded list is always protected; even after
   * mutating the list, the seed entry cannot be removed.
   */
  isRemovable(adminId: string): boolean;
}

export function createAdminAllowList(seed: ReadonlyArray<string>): AdminAllowList {
  // The seed preserves its order; mutators only append to or remove from
  // the live set. `seed[0]` is captured at construction time and is the
  // single protected id (the process can never be fully de-admined).
  const protectedSeed = seed[0];
  const allow = new Set<string>(seed);

  return {
    list(): ReadonlyArray<string> {
      // The Set iteration order is insertion order in V8/Node, so this
      // returns a stable list (seed first, then added in order).
      return Array.from(allow);
    },
    contains(callerId) {
      if (!callerId) {
        return false;
      }
      return allow.has(callerId);
    },
    add(adminId) {
      allow.add(adminId);
    },
    remove(adminId) {
      if (adminId === protectedSeed) {
        return false;
      }
      return allow.delete(adminId);
    },
    isRemovable(adminId) {
      return adminId !== protectedSeed && allow.has(adminId);
    }
  };
}

// Legacy factory: returns a `contains` function for callers that only
// need the guard. New code should prefer `createAdminAllowList` which
// also exposes the list/add/remove helpers used by /admin/admins/*.
export function makeAdminAuthenticator(allowList: AdminAllowList) {
  return (callerId: string | null | undefined): boolean =>
    allowList.contains(callerId);
}

export type AdminAuthenticator = ReturnType<typeof makeAdminAuthenticator>;

// The header that admin clients (the build-monitor admin UI) must send.
// `X-Admin-Id` is kept short and human-readable; it carries the canonical
// owner key (the value the user typed into the admin login form). The
// server side treats it as a plain string — there is no cryptographic
// identity in this iteration (the admin UI is local-only at MVP scale).
export const ADMIN_ID_HEADER = "x-admin-id";

const adminIdHeaderSchema = z.string().min(1);

export async function registerAdminRoutes(
  app: FastifyInstance,
  buildService: BuildService,
  allowList: AdminAllowList
): Promise<void> {
  const isAdmin = makeAdminAuthenticator(allowList);

  app.get("/admin/builds", async (request, reply) => {
    const callerId = adminIdHeaderSchema.safeParse(
      request.headers[ADMIN_ID_HEADER]
    );
    if (!callerId.success) {
      return reply.status(401).send({
        message: "Admin id header missing.",
        header: ADMIN_ID_HEADER
      });
    }
    if (!isAdmin(callerId.data)) {
      return reply.status(403).send({
        message: "Caller is not in the admin allow-list.",
        callerId: callerId.data
      });
    }

    const queryResult = adminListBuildsQuerySchema.safeParse(
      request.query ?? {}
    );
    if (!queryResult.success) {
      return reply.status(400).send({
        message: "Invalid admin list query",
        issues: queryResult.error.issues
      });
    }

    const body = await buildService.listBuildsAcrossUsers(queryResult.data);
    return reply.status(200).send(adminListBuildsResponseSchema.parse(body));
  });

  app.get("/admin/users", async (request, reply) => {
    const callerId = adminIdHeaderSchema.safeParse(
      request.headers[ADMIN_ID_HEADER]
    );
    if (!callerId.success) {
      return reply.status(401).send({
        message: "Admin id header missing.",
        header: ADMIN_ID_HEADER
      });
    }
    if (!isAdmin(callerId.data)) {
      return reply.status(403).send({
        message: "Caller is not in the admin allow-list.",
        callerId: callerId.data
      });
    }

    const body = await buildService.listBuildOwners();
    return reply.status(200).send(adminUserListResponseSchema.parse(body));
  });


  // -------------------------------------------------------------------------
  // Admin allow-list endpoints (TASK-049).
  //
  // GET    /admin/admins              -> list current admins
  // POST   /admin/admins              -> add admin (body: adminId)
  // DELETE /admin/admins/:adminId     -> remove admin
  //
  // All three are guarded by the same X-Admin-Id check as the rest of the
  // /admin/* endpoints. POST and DELETE reject self-removal of the
  // protected seed id (createAdminAllowList ensures at least one admin
  // always remains).
  // -------------------------------------------------------------------------

  app.get("/admin/admins", async (request, reply) => {
    const callerId = adminIdHeaderSchema.safeParse(
      request.headers[ADMIN_ID_HEADER]
    );
    if (!callerId.success) {
      return reply.status(401).send({
        message: "Admin id header missing.",
        header: ADMIN_ID_HEADER
      });
    }
    if (!isAdmin(callerId.data)) {
      return reply.status(403).send({
        message: "Caller is not in the admin allow-list.",
        callerId: callerId.data
      });
    }
    return reply
      .status(200)
      .send(adminAllowListResponseSchema.parse({ admins: allowList.list() }));
  });

  app.post("/admin/admins", async (request, reply) => {
    const callerId = adminIdHeaderSchema.safeParse(
      request.headers[ADMIN_ID_HEADER]
    );
    if (!callerId.success) {
      return reply.status(401).send({
        message: "Admin id header missing.",
        header: ADMIN_ID_HEADER
      });
    }
    if (!isAdmin(callerId.data)) {
      return reply.status(403).send({
        message: "Caller is not in the admin allow-list.",
        callerId: callerId.data
      });
    }
    const bodyResult = adminAllowListAddRequestSchema.safeParse(
      request.body ?? {}
    );
    if (!bodyResult.success) {
      return reply.status(400).send({
        message: "Invalid admin add request",
        issues: bodyResult.error.issues
      });
    }
    allowList.add(bodyResult.data.adminId);
    return reply
      .status(200)
      .send(adminAllowListResponseSchema.parse({ admins: allowList.list() }));
  });

  app.delete<{ Params: { adminId: string } }>(
    "/admin/admins/:adminId",
    async (request, reply) => {
      const callerId = adminIdHeaderSchema.safeParse(
        request.headers[ADMIN_ID_HEADER]
      );
      if (!callerId.success) {
        return reply.status(401).send({
          message: "Admin id header missing.",
          header: ADMIN_ID_HEADER
        });
      }
      if (!isAdmin(callerId.data)) {
        return reply.status(403).send({
          message: "Caller is not in the admin allow-list.",
          callerId: callerId.data
        });
      }
      const target = request.params.adminId;
      if (!allowList.isRemovable(target)) {
        // Either the protected seed id or a not-in-list id. Both fall
        // under 409 Conflict: the resource exists in the conceptual
        // allow-list but is not removable in this state.
        return reply.status(409).send({
          message:
            "Target admin is not removable (protected seed id or not in the allow-list).",
          target
        });
      }
      const removed = allowList.remove(target);
      if (!removed) {
        return reply.status(409).send({
          message: "Target admin was not in the allow-list.",
          target
        });
      }
      return reply.status(200).send(
        adminAllowListRemoveResponseSchema.parse({
          removed: target,
          admins: allowList.list()
        })
      );
    }
  );
}
