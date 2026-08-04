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
