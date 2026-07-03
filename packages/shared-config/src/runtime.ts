import type { RuntimeEnv } from "./env.js";

export type RuntimeSettings = {
  port: number;
  databaseUrl: string;
  buildRepositoryBackend: "memory" | "postgres";
  dbAutoBootstrap: boolean;
  previewTtlMinutes: number;
  runnerPollIntervalMs: number;
  buildTimeoutSeconds: number;
  corsOrigin: string | true | false;
};

export function toRuntimeSettings(env: RuntimeEnv): RuntimeSettings {
  return {
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    buildRepositoryBackend: env.BUILD_REPOSITORY_BACKEND,
    dbAutoBootstrap: env.DB_AUTO_BOOTSTRAP,
    previewTtlMinutes: env.PREVIEW_TTL_MINUTES,
    runnerPollIntervalMs: env.RUNNER_POLL_INTERVAL_MS,
    buildTimeoutSeconds: env.BUILD_TIMEOUT_SECONDS,
    corsOrigin: env.CORS_ORIGIN
  };
}
