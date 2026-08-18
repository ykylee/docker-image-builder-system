import { createHmac, timingSafeEqual } from "node:crypto";

export type Principal = {
  subject: string;
  roles: string[];
  expiresAt: number;
};

type TokenClaims = { sub?: unknown; roles?: unknown; exp?: unknown };

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signature(secret: string, input: string): string {
  return base64Url(createHmac("sha256", secret).update(input).digest());
}

export function signPrincipalToken(
  secret: string,
  claims: { subject: string; roles?: string[]; expiresAt: number }
): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "DIB-Session" }));
  const payload = base64Url(
    JSON.stringify({ sub: claims.subject, roles: claims.roles ?? [], exp: claims.expiresAt })
  );
  const input = `${header}.${payload}`;
  return `${input}.${signature(secret, input)}`;
}

export function verifyPrincipalToken(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Principal | null {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = parts[0];
  const payload = parts[1];
  const provided = parts[2];
  if (!header || !payload || !provided) return null;
  const expected = signature(secret, `${header}.${payload}`);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
    if (typeof parsed.sub !== "string" || parsed.sub.length === 0) return null;
    if (!Number.isInteger(parsed.exp) || (parsed.exp as number) <= nowSeconds) return null;
    const roles = Array.isArray(parsed.roles)
      ? parsed.roles.filter((role): role is string => typeof role === "string")
      : [];
    return { subject: parsed.sub, roles, expiresAt: parsed.exp as number };
  } catch {
    return null;
  }
}

export function bearerToken(authorization: unknown): string | undefined {
  if (typeof authorization !== "string") return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1];
}
