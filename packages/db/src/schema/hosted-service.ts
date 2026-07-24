import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

// Phase 3 / TASK-166 (P3-M1): 앱 1개의 지속 호스팅(앱당 1개 활성). 빌드가
// 성공적으로 배포되면 그 앱의 hosted_service 가 upsert 된다. app_name /
// context_path 는 각각 전역 유일 — 앱당 하나, context path 는 겹치지 않는다.
// deployment_attempt 테이블 패턴 정합.
export const hostedServiceTable = pgTable(
  "hosted_service",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appName: text("app_name").notNull(),
    contextPath: text("context_path").notNull(),
    namespace: text("namespace").notNull(),
    deploymentName: text("deployment_name").notNull(),
    containerPort: integer("container_port").notNull(),
    stripPrefix: boolean("strip_prefix").notNull().default(true),
    // TASK-172 (v0.5.0): 호스팅 URL 스킴(path|subdomain, 기본 path).
    hostingScheme: text("hosting_scheme").notNull().default("path"),
    status: text("status").notNull(),
    url: text("url"),
    currentBuildId: uuid("current_build_id"),
    imageRef: text("image_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastDeployedAt: timestamp("last_deployed_at", { withTimezone: true }),
    // TASK-174 (v0.7.0): live k8s status 캐시(주기 sync). desired `status` 와
    // 분리된 read cache — 실측 available replica + 마지막 sync 시각.
    availableReplicas: integer("available_replicas"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
  },
  (table) => ({
    appNameUnique: uniqueIndex("hosted_service_app_name_idx").on(table.appName),
    contextPathUnique: uniqueIndex("hosted_service_context_path_idx").on(
      table.contextPath
    )
  })
);
