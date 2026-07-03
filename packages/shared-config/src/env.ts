import { z } from "zod";

import {
  DEFAULT_ADMIN_IDS_RAW,
  DEFAULT_BUILD_TIMEOUT_SECONDS,
  DEFAULT_BUILD_REPOSITORY_BACKEND,
  DEFAULT_CORS_ORIGIN,
  DEFAULT_PREVIEW_TTL_MINUTES,
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
  PREVIEW_TTL_MINUTES: z.coerce.number().int().positive().default(DEFAULT_PREVIEW_TTL_MINUTES),
  RUNNER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(DEFAULT_RUNNER_POLL_INTERVAL_MS),
  BUILD_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(DEFAULT_BUILD_TIMEOUT_SECONDS),
  CORS_ORIGIN: z
    .union([z.literal("true"), z.literal("false"), z.string().min(1)])
    .default("true")
    .transform((value) => {
      if (value === "true") {
        return DEFAULT_CORS_ORIGIN;
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
