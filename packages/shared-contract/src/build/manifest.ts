import { z } from "zod";

import { hostingSchemes, hostingTiers } from "./response.js";

export const serviceManifestSchema = z.object({
  version: z.literal(1),
  service: z.object({
    appName: z.string().min(1),
    image: z.object({
      repository: z.string().min(1),
      tag: z.string().min(1)
    })
  }),
  runtime: z.object({
    port: z.int().positive().default(8080),
    command: z.string().min(1).optional(),
    healthPath: z.string().min(1).default("/health"),
    basePathEnv: z.string().min(1).default("APP_BASE_PATH")
  }),
  // Database provisioning is platform-owned. Callers can opt in and declare
  // the migration command, but may not provide a host, schema, role, or
  // password. Those values are generated and delivered through a Secret.
  database: z
    .object({
      enabled: z.boolean().default(false),
      engine: z.literal("postgres").default("postgres"),
      migrationCommand: z.string().min(1).max(512).optional()
    })
    .strict()
    .default({ enabled: false, engine: "postgres" }),
  hosting: z.object({
    scheme: z.enum(hostingSchemes).default("path"),
    contextPath: z.string().min(1),
    stripPrefix: z.boolean().default(true),
    tier: z.enum(hostingTiers).default("sandbox"),
    replicas: z.int().positive().default(1)
  }),
  deployment: z.object({
    adapter: z.enum(["kubectl", "helm", "argocd"]).default("kubectl"),
    namespace: z.string().min(1).default("dib-hosted")
  })
});

export type ServiceManifest = z.infer<typeof serviceManifestSchema>;

export const serviceManifestRevisionSchema = z.object({
  revision: z.int().positive(),
  manifest: serviceManifestSchema,
  updatedBy: z.string().min(1),
  createdAt: z.string().datetime()
});

export type ServiceManifestRevision = z.infer<typeof serviceManifestRevisionSchema>;

export const serviceManifestResponseSchema = z.object({
  appName: z.string().min(1),
  currentRevision: z.int().positive(),
  manifest: serviceManifestSchema,
  updatedBy: z.string().min(1),
  updatedAt: z.string().datetime()
});

export type ServiceManifestResponse = z.infer<typeof serviceManifestResponseSchema>;

export const serviceManifestRevisionListResponseSchema = z.object({
  revisions: z.array(serviceManifestRevisionSchema)
});

export type ServiceManifestRevisionListResponse = z.infer<
  typeof serviceManifestRevisionListResponseSchema
>;

export const serviceDatabaseStatusSchema = z.object({
  appName: z.string().min(1),
  engine: z.literal("postgres"),
  schemaName: z.string().min(1),
  roleName: z.string().min(1),
  secretName: z.string().min(1),
  status: z.enum(["PROVISIONING", "READY", "FAILED"]),
  migrationCommand: z.string().nullable(),
  migrationRevision: z.int().nullable(),
  created: z.boolean()
});

export type ServiceDatabaseStatus = z.infer<typeof serviceDatabaseStatusSchema>;

export const serviceDatabasePurgeRequestSchema = z
  .object({ confirmation: z.string().min(1).max(128) })
  .strict();

export type ServiceDatabasePurgeRequest = z.infer<typeof serviceDatabasePurgeRequestSchema>;

export const serviceDatabasePurgeResponseSchema = z.object({
  appName: z.string().min(1),
  schemaName: z.string().min(1),
  roleName: z.string().min(1),
  secretName: z.string().min(1),
  purged: z.literal(true)
});

export type ServiceDatabasePurgeResponse = z.infer<typeof serviceDatabasePurgeResponseSchema>;

export const serviceDatabaseRotationRequestSchema = serviceDatabasePurgeRequestSchema;
export type ServiceDatabaseRotationRequest = z.infer<typeof serviceDatabaseRotationRequestSchema>;
