import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  adminAllowListAddRequestSchema,
  adminAllowListRemoveResponseSchema,
  adminAllowListResponseSchema,
  adminListBuildsQuerySchema,
  adminListBuildsResponseSchema,
  adminRunnerDeleteResponseSchema,
  adminRunnerListResponseSchema,
  adminRunnerPatchRequestSchema,
  adminRunnerPatchResponseSchema,
  adminRunnerRegisterRequestSchema,
  adminRunnerRegisterResponseSchema,
  adminUserListResponseSchema,
  type AdminRunner
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

// canonical admin id pattern (TASK-049 follow-up). admin allow-list 는
// 민감 surface 라 보존적으로 검증. 일반 userId (BuildRequest.requestedBy)
// 는 postel-style 이지만 admin id 는 letter / digit / dot / underscore /
// hyphen 만 허용. seed 가 비어있거나 (ADMIN_IDS=""), 정규식 위반이면
// boot 단계에서 throw — env 가 잘못 셋업된 채로 admin API 가 노출되는
// 사고를 방지.
const ADMIN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function createAdminAllowList(seed: ReadonlyArray<string>): AdminAllowList {
  if (seed.length === 0) {
    throw new Error(
      "createAdminAllowList: seed must contain at least one admin id. Set ADMIN_IDS env to a non-empty, comma-separated list."
    );
  }
  for (const id of seed) {
    if (!ADMIN_ID_PATTERN.test(id)) {
      throw new Error(
        `createAdminAllowList: seed id "${id}" fails the admin id pattern /^[a-zA-Z0-9._-]+$/. Set ADMIN_IDS env to a comma-separated list of valid ids.`
      );
    }
  }
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
      // in-process mutation 도 정규식 검증. 환경변수 외 경로로 admin id
      // 가 추가될 때도 동일 제약을 강제.
      if (!ADMIN_ID_PATTERN.test(adminId)) {
        throw new Error(
          `adminId "${adminId}" fails the admin id pattern /^[a-zA-Z0-9._-]+$/.`
        );
      }
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
      // DELETE path param 도 동일한 정규식 검증. Fastify route 자체는
      // 어떤 문자열이든 받지만 (default 가 *), admin id charset 밖의
      // 값은 allowList 에 들어있을 리 없고 isRemovable 도 false 라
      // 결과적으로 409 로 떨어지지만, 명시적 400 으로 더 분명하게.
      if (!ADMIN_ID_PATTERN.test(target)) {
        return reply.status(400).send({
          message:
            "Target adminId fails the admin id pattern /^[a-zA-Z0-9._-]+$/.",
          target
        });
      }
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

  // -------------------------------------------------------------------------
  // Admin runner registry endpoints (TASK-069).
  //
  //   GET    /admin/runners              -> list all registered runners
  //   PATCH  /admin/runners/:runnerId    -> DISABLE / REACTIVATE (status)
  //   DELETE /admin/runners/:runnerId    -> permanent removal
  //
  // Runner visibility: every Runner id that has ever called
  // /builds/claim gets a record (self-register on first claim, idempotent).
  // Admin 토글이 claim gate 에 반영 — PATCH status=DISABLED 후 다음 claim 은
  // reason=RUNNER_DISABLED 로 거절된다. 후속 cancellation / rejoin 같은
  // extension 은 PR scope 밖.
  // -------------------------------------------------------------------------

  // TASK-077: admin-initiated runner registration. 기존 흐름은 runner 가
  // /builds/claim 의 body 에 RUNNER_ID 를 실어 보내는 self-register 였는데,
  // 운영자가 신규 cluster / k8s pod / EC2 instance 에서 runner 를 띄우기 전에
  // "이 runner 가 곧 들어온다" 라는 pre-registration 이 어려웠다. 본 endpoint
  // 가 admin UI 의 "Register Runner" 버튼의 backend — admin 이 runnerId 를
  // 미리 등록해 두면 운영자가 어떤 runner 가 cluster 에서 동작하는지 admin UI
  // 에서 즉시 가시화. self-register 와는 별개 surface — admin runner record
  // 가 ACTIVE + firstSeenAt=now() placeholder 로 생성되고, 그 runner 가
  // 실제 띄워져 첫 claim 을 보내면 기존 markRunnerSeen 가 counter /
  // currentBuildId 만 갱신한다 (seamless 통합). 같은 runnerId 로 두 번 호출
  // 시 409 — duplicate.
  app.post(
    "/admin/runners",
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
      const body = adminRunnerRegisterRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          message: "Invalid runner register request body.",
          issues: body.error.issues
        });
      }
      const result = await buildService.createAdminRunner(body.data.runnerId);
      if (result.kind === "duplicate") {
        return reply.status(409).send({
          message: "Runner already registered.",
          runnerId: body.data.runnerId
        });
      }
      // result.kind === "created" — early-return 으로 duplicate 배제 후
      // result 가 `{ kind: "created"; runner: AdminRunner }` 로 narrow.
      const runner: AdminRunner = result.runner;
      return reply
        .status(201)
        .send(adminRunnerRegisterResponseSchema.parse({ runner }));
    }
  );

  app.get("/admin/runners", async (request, reply) => {
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
    const body = await buildService.listAdminRunners();
    return reply
      .status(200)
      .send(adminRunnerListResponseSchema.parse(body));
  });

  app.patch<{ Params: { runnerId: string } }>(
    "/admin/runners/:runnerId",
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
      const target = request.params.runnerId;
      // Runner id 는 admin id 와 달리 broad charset (host 의 어떤 환경 변수도
      // 가능) — 별도 정규식 없이 zod 가 min(1) 까지만 강제. 미래에
      // allow-list 정책을 도입할 경우 ADMIN_ID_PATTERN 을 차용할 수 있다.
      if (!target || target.trim() === "") {
        return reply.status(400).send({
          message: "runnerId is required.",
          target
        });
      }
      const bodyResult = adminRunnerPatchRequestSchema.safeParse(
        request.body ?? {}
      );
      if (!bodyResult.success) {
        return reply.status(400).send({
          message: "Invalid admin runner patch request",
          issues: bodyResult.error.issues
        });
      }
      const updated = await buildService.setAdminRunnerStatus(
        target,
        bodyResult.data.status
      );
      if (!updated) {
        return reply.status(404).send({
          message: "Runner is not registered (no claim seen yet).",
          runnerId: target
        });
      }
      return reply.status(200).send(
        adminRunnerPatchResponseSchema.parse({ runner: updated })
      );
    }
  );

  app.delete<{ Params: { runnerId: string } }>(
    "/admin/runners/:runnerId",
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
      const target = request.params.runnerId;
      // DELETE 는 idempotent — unknown runner 도 200 + { removedRunnerId }
      // 으로 보고. UI 가 stale entry 클릭해도 surprise 가 없다.
      await buildService.deleteAdminRunner(target);
      return reply.status(200).send(
        adminRunnerDeleteResponseSchema.parse({
          removedRunnerId: target
        })
      );
    }
  );
}
