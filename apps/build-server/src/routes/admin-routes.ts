import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  adminListBuildsQuerySchema,
  adminListBuildsResponseSchema,
  adminUserListResponseSchema
} from "@docker-image-builder-system/shared-contract";

import type { BuildService } from "../services/build-service.js";

// Admin guard (ADMIN-004). The admin allow-list comes from runtime
// settings and is captured at app boot time so we do not re-read env on
// every request. The guard is intentionally a single helper so that any
// future admin endpoint can opt in by calling `requireAdmin(...)` and
// callers cannot accidentally bypass it.
export function makeAdminAuthenticator(adminIds: ReadonlyArray<string>) {
  // Lowercase comparison would be more permissive, but the canonical
  // userId is case-sensitive (matches BuildRequest.requestedBy and the
  // existing /builds?requestedBy= filter). Keeping the comparison strict
  // so that adminIds and userIds round-trip identically through the
  // Build Server.
  const allow = new Set(adminIds);

  return function isAdmin(callerId: string | null | undefined): boolean {
    if (!callerId) {
      return false;
    }
    return allow.has(callerId);
  };
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
  isAdmin: AdminAuthenticator
): Promise<void> {
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
}
