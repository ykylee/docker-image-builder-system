import { z } from "zod";

import {
  DEFAULT_ADMIN_IDS_RAW,
  DEFAULT_BUILD_TIMEOUT_SECONDS,
  DEFAULT_BUILD_REPOSITORY_BACKEND,
  DEFAULT_CORS_ORIGIN,
  DEFAULT_RUNNER_POLL_INTERVAL_MS,
  parseAdminIds
} from "./constants.js";

export const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/docker_image_builder"),
  BUILD_REPOSITORY_BACKEND: z
    .enum(["memory", "postgres"])
    .default(DEFAULT_BUILD_REPOSITORY_BACKEND),
  DB_AUTO_BOOTSTRAP: z.coerce.boolean().default(true),
  // Optional during the migration window. When set, Build Server protects
  // admin and Runner control APIs with the signed principal hook; public
  // build intake remains unauthenticated by policy.
  AUTH_SECRET: z.string().min(1).optional().default(""),
  AUTH_MODE: z.enum(["disabled", "legacy", "required", "oidc"]).default("legacy"),
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  OIDC_SCOPES: z.string().min(1).default("openid profile email"),
  OIDC_ROLE_CLAIM: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/).default("roles"),
  OIDC_ADMIN_ROLE: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/).default("admin"),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).default("dib_session"),
  SESSION_COOKIE_SECURE: z.coerce.boolean().default(false),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28_800),
  RUNNER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(DEFAULT_RUNNER_POLL_INTERVAL_MS),
  BUILD_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(DEFAULT_BUILD_TIMEOUT_SECONDS),
  // Capacity values should be populated from cluster allocatable observation
  // after reserving system overhead. Defaults match the validated local kind
  // baseline used by the hosting tier policy.
  HOSTING_CAPACITY_CPU_MILLICORES: z.coerce.number().int().positive().default(2000),
  HOSTING_CAPACITY_MEMORY_MI: z.coerce.number().int().positive().default(5632),
  HOSTING_CAPACITY_RESERVE_RATIO: z.coerce.number().min(0).lt(1).default(0.25),
  HOSTING_CAPACITY_DRIFT_CHECK_INTERVAL_MS: z.coerce.number().int().nonnegative().default(0),
  HOSTING_CAPACITY_DRIFT_THRESHOLD: z.coerce.number().min(0).lt(1).default(0.2),
  HOSTING_CAPACITY_DRIFT_ALERT_WEBHOOK_URL: z.string().url().optional(),
  HOSTING_CAPACITY_DRIFT_ALERT_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(900_000),
  CORS_ORIGIN: z
    .union([z.literal("true"), z.literal("false"), z.string().min(1)])
    .default("false")
    .transform((value) => {
      if (value === "true") {
        return true as const;
      }
      if (value === "false") {
        return false as const;
      }
      return value;
    }),
  ADMIN_IDS: z
    .string()
    .default(DEFAULT_ADMIN_IDS_RAW)
    .transform((value) => parseAdminIds(value))
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseRuntimeEnv(env: NodeJS.ProcessEnv): RuntimeEnv {
  return runtimeEnvSchema.parse(env);
}
