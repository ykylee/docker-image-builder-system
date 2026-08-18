import type { RuntimeEnv } from "./env.js";

export type RuntimeSettings = {
  nodeEnv?: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  buildRepositoryBackend: "memory" | "postgres";
  dbAutoBootstrap: boolean;
  authSecret?: string;
  authMode?: "disabled" | "legacy" | "required" | "oidc";
  oidcIssuerUrl?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcRedirectUri?: string;
  oidcScopes: string;
  oidcRoleClaim: string;
  sessionCookieName: string;
  sessionCookieSecure: boolean;
  sessionTtlSeconds: number;
  runnerPollIntervalMs: number;
  buildTimeoutSeconds: number;
  corsOrigin: string | true | false;
  adminIds: string[];
  hostingCapacity: {
    cpuMillicores: number;
    memoryMi: number;
  };
  hostingCapacityReserveRatio: number;
  hostingCapacityDriftCheckIntervalMs: number;
  hostingCapacityDriftThreshold: number;
  hostingCapacityDriftAlertWebhookUrl?: string;
  hostingCapacityDriftAlertCooldownMs: number;
};

export function toRuntimeSettings(env: RuntimeEnv): RuntimeSettings {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    buildRepositoryBackend: env.BUILD_REPOSITORY_BACKEND,
    dbAutoBootstrap: env.DB_AUTO_BOOTSTRAP,
    authSecret: env.AUTH_SECRET,
    authMode: env.AUTH_MODE,
    oidcIssuerUrl: env.OIDC_ISSUER_URL,
    oidcClientId: env.OIDC_CLIENT_ID,
    oidcClientSecret: env.OIDC_CLIENT_SECRET,
    oidcRedirectUri: env.OIDC_REDIRECT_URI,
    oidcScopes: env.OIDC_SCOPES,
    oidcRoleClaim: env.OIDC_ROLE_CLAIM,
    sessionCookieName: env.SESSION_COOKIE_NAME,
    sessionCookieSecure: env.SESSION_COOKIE_SECURE,
    sessionTtlSeconds: env.SESSION_TTL_SECONDS,
    runnerPollIntervalMs: env.RUNNER_POLL_INTERVAL_MS,
    buildTimeoutSeconds: env.BUILD_TIMEOUT_SECONDS,
    corsOrigin: env.CORS_ORIGIN,
    adminIds: env.ADMIN_IDS,
    hostingCapacity: {
      cpuMillicores: env.HOSTING_CAPACITY_CPU_MILLICORES,
      memoryMi: env.HOSTING_CAPACITY_MEMORY_MI
    },
    hostingCapacityReserveRatio: env.HOSTING_CAPACITY_RESERVE_RATIO,
    hostingCapacityDriftCheckIntervalMs: env.HOSTING_CAPACITY_DRIFT_CHECK_INTERVAL_MS,
    hostingCapacityDriftThreshold: env.HOSTING_CAPACITY_DRIFT_THRESHOLD,
    hostingCapacityDriftAlertWebhookUrl: env.HOSTING_CAPACITY_DRIFT_ALERT_WEBHOOK_URL,
    hostingCapacityDriftAlertCooldownMs: env.HOSTING_CAPACITY_DRIFT_ALERT_COOLDOWN_MS
  };
}
