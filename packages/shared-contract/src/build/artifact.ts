import { z } from "zod";

export const artifactEcosystems = ["python", "npm", "go", "rust"] as const;
export type ArtifactEcosystem = (typeof artifactEcosystems)[number];

export const artifactModes = ["required", "fallback"] as const;
export type ArtifactMode = (typeof artifactModes)[number];

export const artifactErrorCodes = [
  "ARTIFACT_UNAVAILABLE",
  "ARTIFACT_INTEGRITY_FAILED",
  "UPSTREAM_BLOCKED",
  "PREFETCH_FAILED",
  "FACTORY_AUTH_FAILED"
] as const;
export type ArtifactErrorCode = (typeof artifactErrorCodes)[number];

/**
 * Build-time routing profile. Credentials are intentionally absent: they are
 * injected by the Runner/BuildKit secret boundary, never supplied in a build
 * request or persisted in this contract.
 */
export const artifactFactoryProfileSchema = z
  .object({
    version: z.literal(1),
    ecosystem: z.enum(artifactEcosystems),
    mode: z.enum(artifactModes).default("required"),
    factoryUrl: z.string().url(),
    packageProxyUrl: z.string().url().optional(),
    registryMirrorUrl: z.string().url().optional(),
    prefetchEnabled: z.boolean().default(false),
    maxBuildRetries: z.literal(1).default(1)
  })
  .strict()
  .meta({
    id: "ArtifactFactoryProfile",
    description:
      "Internal artifact proxy routing profile. Secret material is injected out-of-band."
  });

export type ArtifactFactoryProfile = z.infer<typeof artifactFactoryProfileSchema>;

export const artifactSourceSchema = z
  .object({
    kind: z.enum(["upstream", "prefetch", "local"]),
    host: z.string().min(1)
  })
  .strict();

export const artifactManifestSchema = z
  .object({
    artifactId: z.string().min(1),
    coordinate: z.string().min(1),
    contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    lockfileDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    baseImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    recipeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    ecosystem: z.enum(artifactEcosystems),
    source: artifactSourceSchema,
    provenance: z
      .object({
        fetchedAt: z.string().datetime(),
        verified: z.literal(true)
      })
      .strict()
  })
  .strict()
  .meta({
    id: "ArtifactManifest",
    description:
      "Immutable dependency artifact identity and provenance. All digest fields are pinned."
  });

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
