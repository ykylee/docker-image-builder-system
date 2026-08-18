import assert from "node:assert/strict";
import test from "node:test";

import { serviceDatabaseNames, ServiceDatabaseProvisioner } from "../src/services/service-database-provisioner.js";

test("serviceDatabaseNames is stable and PostgreSQL-safe", () => {
  const first = serviceDatabaseNames("My Service / Production");
  const second = serviceDatabaseNames("My Service / Production");
  assert.deepEqual(first, second);
  assert.match(first.schemaName, /^svc_[a-z0-9-]+_[a-f0-9]{12}$/);
  assert.match(first.roleName, /^svc_[a-f0-9]{12}$/);
  assert.ok(first.schemaName.length <= 63);
});

test("provision creates a schema and role once, without returning existing password", async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      if (text.startsWith("SELECT app_name")) return { rows: [] };
      return { rows: [] };
    },
    release() {}
  };
  const pool = { connect: async () => client } as never;
  const result = await new ServiceDatabaseProvisioner(pool).provision({
    appName: "demo-app",
    migrationCommand: "npm run db:migrate"
  });

  assert.equal(result.created, true);
  assert.ok(result.password);
  assert.ok(queries.some((query) => query.text.startsWith("CREATE SCHEMA")));
  assert.ok(queries.some((query) => query.text.startsWith("CREATE ROLE")));
  assert.ok(queries.some((query) => query.text.includes("INSERT INTO service_database")));
  assert.ok(!queries.some((query) => query.text.includes("host.docker.internal")));
});

test("getStatus returns sanitized provisioning metadata", async () => {
  const pool = {
    async query() {
      return { rows: [{ app_name: "demo-app", engine: "postgres", schema_name: "svc_demo", role_name: "svc_role", secret_name: "dib-service-demo-db", status: "READY", migration_command: "npm run db:migrate", migration_revision: 3 }] };
    }
  } as never;
  const status = await new ServiceDatabaseProvisioner(pool).getStatus("demo-app");
  assert.deepEqual(status, {
    appName: "demo-app",
    engine: "postgres",
    schemaName: "svc_demo",
    roleName: "svc_role",
    secretName: "dib-service-demo-db",
    status: "READY",
    migrationCommand: "npm run db:migrate",
    migrationRevision: 3,
    created: false
  });
});

test("getStatus preserves FAILED lifecycle state", async () => {
  const pool = {
    async query() {
      return { rows: [{ app_name: "demo-app", schema_name: "svc_demo", role_name: "svc_role", secret_name: "dib-service-demo-db", status: "FAILED", migration_command: null, migration_revision: null }] };
    }
  } as never;
  const status = await new ServiceDatabaseProvisioner(pool).getStatus("demo-app");
  assert.equal(status?.status, "FAILED");
});

test("recoverStaleProvisioning marks orphaned rows failed", async () => {
  let query = "";
  const pool = {
    async query(text: string) {
      query = text;
      return { rowCount: 2, rows: [] };
    }
  } as never;
  const count = await new ServiceDatabaseProvisioner(pool).recoverStaleProvisioning(new Date(0), "timeout");
  assert.equal(count, 2);
  assert.match(query, /status = 'FAILED'/);
});

test("purge drops owned schema and role before deleting metadata", async () => {
  const queries: string[] = [];
  const client = {
    async query(text: string) {
      queries.push(text);
      if (text.startsWith("SELECT app_name")) {
        return { rows: [{ app_name: "demo-app", schema_name: "svc_demo", role_name: "svc_role", secret_name: "dib-service-demo-db" }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  const pool = { connect: async () => client } as never;
  const result = await new ServiceDatabaseProvisioner(pool).purge("demo-app");
  assert.deepEqual(result, {
    appName: "demo-app",
    schemaName: "svc_demo",
    roleName: "svc_role",
    secretName: "dib-service-demo-db",
    purged: true
  });
  assert.ok(queries.some((query) => query.includes("DROP SCHEMA \"svc_demo\" CASCADE")));
  assert.ok(queries.some((query) => query.includes("DROP ROLE \"svc_role\"")));
  assert.ok(queries.some((query) => query.includes("DELETE FROM service_database")));
});

test("rotate changes the role password without returning it in the status payload", async () => {
  const queries: string[] = [];
  const client = {
    async query(text: string) {
      queries.push(text);
      if (text.startsWith("SELECT app_name")) {
        return { rows: [{ app_name: "demo-app", schema_name: "svc_demo", role_name: "svc_role", secret_name: "dib-service-demo-db", status: "READY", migration_command: "npm run db:migrate", migration_revision: 2 }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  const pool = { connect: async () => client } as never;
  const result = await new ServiceDatabaseProvisioner(pool).rotate("demo-app");
  assert.equal(result?.status, "PROVISIONING");
  assert.ok(result?.password);
  assert.ok(queries.some((query) => query.includes("ALTER ROLE \"svc_role\" PASSWORD")));
  assert.ok(queries.some((query) => query.includes("UPDATE service_database SET status = 'PROVISIONING'")));
});
