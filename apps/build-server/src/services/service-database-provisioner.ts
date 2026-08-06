import { createHash, randomBytes } from "node:crypto";

import type { DatabasePool } from "@docker-image-builder-system/db";

export interface ServiceDatabaseProvisioningInput {
  appName: string;
  migrationCommand?: string;
}

export interface ServiceDatabaseProvisioningRecord {
  appName: string;
  engine: "postgres";
  schemaName: string;
  roleName: string;
  secretName: string;
  status: "PROVISIONING" | "READY" | "FAILED";
  migrationCommand: string | null;
  migrationRevision: number | null;
  created: boolean;
  // Internal hand-off only. Never serialize this from an HTTP handler.
  password?: string;
}

export interface ServiceDatabasePurgeRecord {
  appName: string;
  schemaName: string;
  roleName: string;
  secretName: string;
  purged: true;
}

const IDENTIFIER_MAX = 63;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function stableServiceSuffix(appName: string): string {
  return createHash("sha256").update(appName).digest("hex").slice(0, 12);
}

function safeSlug(appName: string): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 30) || "service";
}

export function serviceDatabaseNames(appName: string) {
  const normalized = appName.trim();
  const suffix = stableServiceSuffix(normalized);
  const slug = safeSlug(normalized);
  return {
    schemaName: `svc_${slug}_${suffix}`.slice(0, IDENTIFIER_MAX),
    roleName: `svc_${suffix}`,
    secretName: `dib-service-${slug}-${suffix}-db`.slice(0, 253)
  };
}

export function serviceDatabaseUrl(gatewayHost: string, databaseName: string, roleName: string, password: string): string {
  return `postgres://${encodeURIComponent(roleName)}:${encodeURIComponent(password)}@${gatewayHost}/${encodeURIComponent(databaseName)}`;
}

export class ServiceDatabaseProvisioner {
  constructor(private readonly pool: DatabasePool) {}

  async provision(input: ServiceDatabaseProvisioningInput): Promise<ServiceDatabaseProvisioningRecord> {
    const appName = input.appName.trim();
    if (!appName) throw new Error("service database appName is required");

    const names = serviceDatabaseNames(appName);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [appName]);

      const existing = await client.query(
        "SELECT app_name, engine, schema_name, role_name, secret_name, status, migration_command, migration_revision FROM service_database WHERE app_name = $1",
        [appName]
      );
      if (existing.rows.length > 0) {
        await client.query("COMMIT");
        const row = existing.rows[0] as Record<string, unknown>;
        return {
          appName: String(row.app_name),
          engine: "postgres",
          schemaName: String(row.schema_name),
          roleName: String(row.role_name),
          secretName: String(row.secret_name),
          status: row.status === "READY" ? "READY" : "PROVISIONING",
          migrationCommand: typeof row.migration_command === "string" ? row.migration_command : null,
          migrationRevision: typeof row.migration_revision === "number" ? row.migration_revision : null,
          created: false
        };
      }

      const password = randomBytes(32).toString("base64url");
      const schema = quoteIdentifier(names.schemaName);
      const role = quoteIdentifier(names.roleName);
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${quoteLiteral(password)}`);
      await client.query(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`);
      await client.query(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role}`);
      await client.query(`ALTER ROLE ${role} SET search_path = ${schema}`);
      await client.query(
        "INSERT INTO service_database (app_name, engine, schema_name, role_name, secret_name, status, migration_command) VALUES ($1, 'postgres', $2, $3, $4, 'PROVISIONING', $5)",
        [appName, names.schemaName, names.roleName, names.secretName, input.migrationCommand ?? null]
      );
      await client.query("COMMIT");
      return {
        appName,
        engine: "postgres",
        ...names,
        status: "PROVISIONING",
        migrationCommand: input.migrationCommand ?? null,
        migrationRevision: null,
        created: true,
        password
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async markReady(appName: string): Promise<void> {
    await this.pool.query(
      "UPDATE service_database SET status = 'READY', updated_at = NOW() WHERE app_name = $1",
      [appName.trim()]
    );
  }

  async markFailed(appName: string, error: string): Promise<void> {
    await this.pool.query(
      "UPDATE service_database SET status = 'FAILED', last_error = $2, updated_at = NOW() WHERE app_name = $1",
      [appName.trim(), error.slice(0, 2000)]
    );
  }

  async rotate(appName: string): Promise<ServiceDatabaseProvisioningRecord | null> {
    const normalizedAppName = appName.trim();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [normalizedAppName]);
      const existing = await client.query(
        "SELECT app_name, schema_name, role_name, secret_name, status, migration_command, migration_revision FROM service_database WHERE app_name = $1",
        [normalizedAppName]
      );
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const row = existing.rows[0] as Record<string, unknown>;
      const password = randomBytes(32).toString("base64url");
      await client.query(`ALTER ROLE ${quoteIdentifier(String(row.role_name))} PASSWORD ${quoteLiteral(password)}`);
      await client.query(
        "UPDATE service_database SET status = 'PROVISIONING', last_error = NULL, updated_at = NOW() WHERE app_name = $1",
        [normalizedAppName]
      );
      await client.query("COMMIT");
      return {
        appName: String(row.app_name),
        engine: "postgres",
        schemaName: String(row.schema_name),
        roleName: String(row.role_name),
        secretName: String(row.secret_name),
        status: "PROVISIONING",
        migrationCommand: typeof row.migration_command === "string" ? row.migration_command : null,
        migrationRevision: typeof row.migration_revision === "number" ? row.migration_revision : null,
        created: false,
        password
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getStatus(appName: string): Promise<ServiceDatabaseProvisioningRecord | null> {
    const result = await this.pool.query(
      "SELECT app_name, engine, schema_name, role_name, secret_name, status, migration_command, migration_revision FROM service_database WHERE app_name = $1",
      [appName.trim()]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    const status = row.status === "READY" || row.status === "FAILED" ? row.status : "PROVISIONING";
    return {
      appName: String(row.app_name),
      engine: "postgres",
      schemaName: String(row.schema_name),
      roleName: String(row.role_name),
      secretName: String(row.secret_name),
      status,
      migrationCommand: typeof row.migration_command === "string" ? row.migration_command : null,
      migrationRevision: typeof row.migration_revision === "number" ? row.migration_revision : null,
      created: false
    };
  }

  async purge(appName: string): Promise<ServiceDatabasePurgeRecord | null> {
    const normalizedAppName = appName.trim();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [normalizedAppName]);
      const existing = await client.query(
        "SELECT app_name, schema_name, role_name, secret_name FROM service_database WHERE app_name = $1",
        [normalizedAppName]
      );
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const row = existing.rows[0] as Record<string, unknown>;
      await client.query(`DROP SCHEMA ${quoteIdentifier(String(row.schema_name))} CASCADE`);
      await client.query(`DROP ROLE ${quoteIdentifier(String(row.role_name))}`);
      await client.query("DELETE FROM service_database WHERE app_name = $1", [normalizedAppName]);
      await client.query("COMMIT");
      return {
        appName: String(row.app_name),
        schemaName: String(row.schema_name),
        roleName: String(row.role_name),
        secretName: String(row.secret_name),
        purged: true
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
