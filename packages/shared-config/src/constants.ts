export const DEFAULT_RUNNER_POLL_INTERVAL_MS = 5000;
export const DEFAULT_BUILD_TIMEOUT_SECONDS = 900;
export const DEFAULT_BUILD_REPOSITORY_BACKEND = "memory";
export const DEFAULT_CORS_ORIGIN = true;

// Admin identifier allow-list. The env value is a comma-separated string
// (e.g. "admin,yky.lee,other-admin"). The default below seeds the two
// admin ids that the project owner specified at ADMIN-* kickoff. Operators
// can override the list at runtime via the ADMIN_IDS env without code
// changes. Whitespace around each id is trimmed; empty entries are dropped.
export const DEFAULT_ADMIN_IDS_RAW = "admin,yky.lee";

export function parseAdminIds(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
