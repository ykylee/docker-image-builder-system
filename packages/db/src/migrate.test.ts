// TASK-064 운영 baseline — migration runner 단위 테스트.
// build-server 와 동일하게 Node native test runner (`node --import tsx
// --test`) 사용. listMigrationFiles + applyMigrations / listMigrations
// 의 dry-run, idempotent, sort, `--to` flag 동작을 검증한다. 실제
// postgres 가 필요한 integration test 는 `scripts/smoke.sh` 의 e2e
// 경로로 위임.
import { describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

import {
  applyMigrations,
  listMigrationFiles,
  listMigrations,
  type MigrationFile
} from "./migrate.js";

function makeTempMigrationsDir(): string {
  return mkdtempSync(join(tmpdir(), "migrate-test-"));
}

function writeMigration(dir: string, version: string, body: string): string {
  const name = `${version}_example.sql`;
  writeFileSync(join(dir, name), body);
  return name;
}

interface FakePoolState {
  rows: { version: string; applied_at: Date; checksum: string | null }[];
  trace: string[];
  failOnSqlContains?: string;
}

interface FakePool {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<{
    query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
    release: () => void;
  }>;
}

function makeFakePool(state: FakePoolState): FakePool {
  const query = async (text: string, values?: unknown[]) => {
    const trimmed = text.trim();
    state.trace.push(trimmed.split(/\s+/)[0] ?? "");
    if (trimmed.startsWith("CREATE TABLE") && trimmed.includes("schema_migrations")) {
      return { rows: [] };
    }
    if (trimmed.startsWith("SELECT version, applied_at FROM schema_migrations")) {
      return { rows: state.rows };
    }
    if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
      return { rows: [] };
    }
    if (trimmed.startsWith("INSERT INTO schema_migrations")) {
      const version = values?.[0];
      const checksum = values?.[1];
      if (typeof version === "string") {
        state.rows.push({
          version,
          applied_at: new Date(),
          checksum: checksum == null ? null : String(checksum)
        });
      }
      return { rows: [] };
    }
    if (state.failOnSqlContains && trimmed.includes(state.failOnSqlContains)) {
      throw new Error(`forced failure on SQL containing: ${state.failOnSqlContains}`);
    }
    return { rows: [] };
  };
  const connect = async () => {
    const client = {
      query: async (text: string, values?: unknown[]) => query(text, values),
      release: () => {}
    };
    return client;
  };
  return { query, connect };
}

describe("listMigrationFiles", () => {
  it("returns versioned .sql files in lexicographic order", () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "SELECT 1;");
      writeMigration(dir, "0002_second", "SELECT 2;");
      writeMigration(dir, "0003_third", "SELECT 3;");
      writeFileSync(join(dir, "README.md"), "ignored");
      writeFileSync(join(dir, "0000_not_match.sql.bak"), "ignored");

      const files = listMigrationFiles(dir);
      assert.deepEqual(
        files.map((f) => f.version),
        ["0001", "0002", "0003"]
      );
      assert.deepEqual(
        files.map((f) => f.filename),
        ["0001_first_example.sql", "0002_second_example.sql", "0003_third_example.sql"]
      );
      assert.equal(files[0]?.sql, "SELECT 1;");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("applyMigrations (mock pool)", () => {
  it("applies all pending migrations in order on first run", async () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "ALTER TABLE foo ADD COLUMN a TEXT;");
      writeMigration(dir, "0002_second", "ALTER TABLE foo ADD COLUMN b TEXT;");
      const state: FakePoolState = { rows: [], trace: [] };
      const pool = makeFakePool(state);

      const result = await applyMigrations(pool as never, { migrationsDir: dir });

      assert.deepEqual(
        result.applied.map((m) => m.version),
        ["0001", "0002"]
      );
      assert.deepEqual(result.skipped, []);
      assert.deepEqual(result.pending, []);
      assert.deepEqual(
        state.rows.map((r) => r.version),
        ["0001", "0002"]
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is idempotent — second run skips applied versions", async () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "SELECT 1;");
      writeMigration(dir, "0002_second", "SELECT 2;");
      const state: FakePoolState = {
        rows: [
          { version: "0001", applied_at: new Date(), checksum: null },
          { version: "0002", applied_at: new Date(), checksum: null }
        ],
        trace: []
      };
      const pool = makeFakePool(state);

      const result = await applyMigrations(pool as never, { migrationsDir: dir });

      assert.deepEqual(result.applied, []);
      assert.deepEqual(
        result.skipped.map((m) => m.version),
        ["0001", "0002"]
      );
      assert.deepEqual(result.pending, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dry-run returns plan without executing", async () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "SELECT 1;");
      writeMigration(dir, "0002_second", "SELECT 2;");
      const state: FakePoolState = { rows: [], trace: [] };
      const pool = makeFakePool(state);

      const result = await applyMigrations(pool as never, {
        migrationsDir: dir,
        dryRun: true
      });

      assert.deepEqual(result.applied, []);
      assert.deepEqual(
        result.pending.map((m) => m.version),
        ["0001", "0002"]
      );
      assert.deepEqual(state.rows, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("'to' option limits to a specific version inclusive", async () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "SELECT 1;");
      writeMigration(dir, "0002_second", "SELECT 2;");
      writeMigration(dir, "0003_third", "SELECT 3;");
      const state: FakePoolState = { rows: [], trace: [] };
      const pool = makeFakePool(state);

      const result = await applyMigrations(pool as never, {
        migrationsDir: dir,
        to: "0002"
      });

      assert.deepEqual(
        result.applied.map((m) => m.version),
        ["0001", "0002"]
      );
      assert.deepEqual(
        state.rows.map((r) => r.version),
        ["0001", "0002"]
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rolls back failed migration and surfaces error", async () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "SELECT 1;");
      writeMigration(dir, "0002_bad", "WILL_FAIL");
      const state: FakePoolState = {
        rows: [],
        trace: [],
        failOnSqlContains: "WILL_FAIL"
      };
      const pool = makeFakePool(state);

      await assert.rejects(
        () => applyMigrations(pool as never, { migrationsDir: dir }),
        /migration 0002/
      );
      // ROLLBACK 이 호출되었는지 trace 로 확인
      assert.ok(state.trace.includes("ROLLBACK"));
      // 0001 까지만 적용되고 0002 의 schema_migrations INSERT 는 없어야 함
      assert.deepEqual(state.rows.map((r) => r.version), ["0001"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("listMigrations returns pending/skipped without applying", async () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "SELECT 1;");
      writeMigration(dir, "0002_second", "SELECT 2;");
      const state: FakePoolState = {
        rows: [
          { version: "0001", applied_at: new Date(), checksum: null }
        ],
        trace: []
      };
      const pool = makeFakePool(state);

      const result = await listMigrations(pool as never, { migrationsDir: dir });

      assert.deepEqual(
        result.skipped.map((m) => m.version),
        ["0001"]
      );
      assert.deepEqual(
        result.pending.map((m) => m.version),
        ["0002"]
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("MigrationFile shape", () => {
  it("exposes version, filename, sql fields", () => {
    const file: MigrationFile = {
      version: "0001",
      filename: "0001_first.sql",
      sql: "SELECT 1;"
    };
    assert.equal(file.version, "0001");
    assert.equal(file.filename, "0001_first.sql");
    assert.equal(file.sql, "SELECT 1;");
  });
});

import { parseMigrationVersion } from "./migrate.js";

describe("parseMigrationVersion", () => {
  it("accepts 4-digit numeric version", () => {
    assert.equal(parseMigrationVersion("0001"), 1);
    assert.equal(parseMigrationVersion("0042"), 42);
  });

  it("rejects non-4-digit or non-numeric", () => {
    assert.equal(parseMigrationVersion("001"), null);
    assert.equal(parseMigrationVersion("00010"), null);
    assert.equal(parseMigrationVersion("abcd"), null);
    assert.equal(parseMigrationVersion(""), null);
  });
});

describe("applyMigrations invalid --to", () => {
  it("rejects non-numeric --to with clear error", async () => {
    const dir = makeTempMigrationsDir();
    try {
      writeMigration(dir, "0001_first", "SELECT 1;");
      const state: FakePoolState = { rows: [], trace: [] };
      const pool = makeFakePool(state);

      await assert.rejects(
        () =>
          applyMigrations(pool as never, {
            migrationsDir: dir,
            to: "latest"
          }),
        /invalid --to version/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});