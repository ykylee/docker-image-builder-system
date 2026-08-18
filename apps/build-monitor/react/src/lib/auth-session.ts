export type AuthSession = {
  authenticated: boolean;
  subject?: string;
  roles?: string[];
};

export async function getAuthSession(): Promise<AuthSession> {
  const response = await fetch("/auth/session", {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Session bootstrap failed: ${response.status}`);
  return (await response.json()) as AuthSession;
}

export function beginOidcLogin(returnTo = "/builds"): void {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/builds";
  window.location.assign(`/auth/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
}

export async function logoutAuthSession(): Promise<void> {
  const response = await fetch("/auth/logout", { method: "POST", credentials: "include" });
  if (!response.ok && response.status !== 204) throw new Error(`Logout failed: ${response.status}`);
}
