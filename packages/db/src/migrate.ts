// TASK-064 운영 baseline — postgres migration runner.
//
// 현재 `apps/build-server/migrations/0001_*.sql` ~ `0003_*.sql` 는
// idempotent (IF EXISTS / IF NOT EXISTS) SQL 이지만, 적용 이력을 추적할
// 메커니즘이 없어서 운영자가 매번 "이미 적용됐는지" 를 손으로 비교해야
// 한다. 본 모듈은 `schema_migrations` 테이블을 만들고, 주어진
// migrations 디렉터리의 `000N_*.sql` 파일을 lexicographic 순서대로
// 적용한 뒤 version 행을 insert 한다. 한 migration = 한 transaction.
//
// library surface (applyMigrations / listMigrations) 와 CLI surface
// (apps/build-server/scripts/migrate.ts) 가 같은 함수 위에서 동작한다.

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { DatabasePool } from "./client.js";

// @types/pg 8 의 namespace alias 가 TypeScript NodeNext resolution 에서
// named import 로 안 잡히는 환경이 있어, connect() 반환 타입은 structural
// 최소 subset 으로 local 정의한다. runtime 에서는 pg.PoolClient 가 release()
// / query(text) / query(text, values) 를 노출하므로 이 surface 면 충분.
interface PoolClient {
  query(text: string): Promise<{ rows: unknown[] }>;
  query(text: string, values: unknown[]): Promise<{ rows: unknown[] }>;
  release(): void;
}

export interface MigrationFile {
  version: string;
  filename: string;
  sql: string;
}

export interface MigrationRecord {
  version: string;
  appliedAt: Date;
}

export interface ApplyMigrationsOptions {
  /** `0001_*.sql` 등 번호 prefix SQL 이 모여있는 디렉터리. */
  migrationsDir: string;
  /** true 면 SQL 실행 없이 적용 계획만 반환한다. */
  dryRun?: boolean;
  /** 이 version 까지만 적용 (inclusive). 미지정 시 최신까지. */
  to?: string;
  /**
   * sha256 checksum 까지 `schema_migrations.checksum` 에 기록. default
   * true — 운영 환경에서 migration file 이 사후에 수정돼도 다음 apply
   * 시점에 drift 검출 (warning level) 단서가 된다. perf 영향은
   * createHash + 1 row insert 추가뿐이라 무시 가능.
   */
  recordChecksum?: boolean;
}

export interface ApplyMigrationsResult {
  applied: MigrationFile[];
  skipped: MigrationFile[];
  pending: MigrationFile[];
}

const SCHEMA_MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum TEXT
  )
`;

const VERSION_PATTERN = /^(\d{4})_.+\.sql$/;
const VERSION_PREFIX_LENGTH = 4;

/**
 * migrations 디렉터리에서 `000N_*.sql` 파일을 lexicographic 순서로 정렬해
 * 반환한다. prefix 가 매칭되지 않는 파일은 무시 (notes / readme 등).
 */
export function listMigrationFiles(migrationsDir: string): MigrationFile[] {
  const entries = readdirSync(migrationsDir)
    .filter((name) => VERSION_PATTERN.test(name))
    .sort();
  return entries.map((filename) => {
    const version = filename.slice(0, VERSION_PREFIX_LENGTH);
    const sql = readFileSync(join(migrationsDir, filename), "utf8");
    return { version, filename, sql };
  });
}

/**
 * version prefix 가 4자리 숫자인지 검증. 잘못된 format 은 `null` 로 거부해
 * caller 가 명확한 에러로 변환할 수 있게 한다. 5자리+ version 은 운영
 * 단계에서 version 공간이 4 자리로 부족해진다는 신호로 다룬다.
 */
export function parseMigrationVersion(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  return Number.parseInt(value, 10);
}

/**
 * `--to` flag 등으로 받은 version 이 적용 대상 file 들의 version 보다
 * 큰지 검사. lex compare 가 아닌 numeric compare 로 직렬화.
 */
function isVersionWithinLimit(version: string, to: string | undefined): boolean {
  if (to === undefined) return true;
  const target = parseMigrationVersion(to);
  if (target === null) {
    throw new Error(
      `invalid --to version "${to}" (expected 4-digit numeric, e.g. 0002)`
    );
  }
  const current = parseMigrationVersion(version);
  if (current === null) {
    // listMigrationFiles 가 4자리 prefix 만 통과시키므로 도달 불가지만
    // 방어적으로 0 으로 fallback (== 적용 안 함).
    return false;
  }
  return current <= target;
}

function computeChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function ensureSchemaMigrationsTable(pool: DatabasePool): Promise<void> {
  await pool.query(SCHEMA_MIGRATIONS_TABLE_DDL);
}

interface AppliedMigrationRow {
  version: string;
  applied_at: Date;
}

async function readAppliedMigrations(pool: DatabasePool): Promise<MigrationRecord[]> {
  // pg.Pool.query 는 4 개 overload (text-only / parameterized / Submittable /
  // values-only). 첫 번째 generic 위치에 Row 타입을 직접 박으면 parameterized
  // overload 가 잡혀서 Submittable 제약에 막힌다. 명시적 any-cast 로 row
  // 타입을 강제하고 map 에서 narrow 한다.
  const result = (await pool.query(
    `SELECT version, applied_at FROM schema_migrations ORDER BY version`
  )) as { rows: AppliedMigrationRow[] };
  return result.rows.map((row) => ({
    version: row.version,
    appliedAt: row.applied_at
  }));
}

/**
 * 아직 적용되지 않은 migration 을 한 transaction 단위로 적용한다.
 * migration SQL 안에 `BEGIN`/`COMMIT` 이 포함돼 있으면 그대로 nested
 * transaction 으로 흘러간다 (postgres savepoint). — 현 저장소의
 * `0001_*.sql` ~ `0003_*.sql` 모두 자체 BEGIN/COMMIT 을 포함하므로
 * runner 의 BEGIN/COMMIT 은 savepoint 가 된다. 의도적으로 분리: SQL
 * 파일이 단독 psql 에서 실행될 때도 정상 동작하도록 자체 트랜잭션을
 * 두고, runner 는 partial failure 자동 rollback 의 안전망 역할.
 */
export async function applyMigrations(
  pool: DatabasePool,
  options: ApplyMigrationsOptions
): Promise<ApplyMigrationsResult> {
  await ensureSchemaMigrationsTable(pool);
  const applied = await readAppliedMigrations(pool);
  const appliedVersions = new Set(applied.map((m) => m.version));

  const files = listMigrationFiles(options.migrationsDir);
  const toFilter = files.filter((f) => isVersionWithinLimit(f.version, options.to));

  const pending: MigrationFile[] = [];
  const alreadyApplied: MigrationFile[] = [];
  for (const file of toFilter) {
    if (appliedVersions.has(file.version)) {
      alreadyApplied.push(file);
    } else {
      pending.push(file);
    }
  }

  if (options.dryRun) {
    return { applied: [], skipped: alreadyApplied, pending };
  }

  const recordChecksum = options.recordChecksum !== false;
  const justApplied: MigrationFile[] = [];
  for (const file of pending) {
    // pg.Pool 의 `connect()` 가 반환하는 PoolClient 는 @types/pg 의
    // namespace alias 로 잡혀 타입 시그니처가 노출되지 않을 수 있어
    // local PoolClient interface 로 cast.
    const client = (await (pool as unknown as {
      connect(): Promise<PoolClient>;
    }).connect()) as PoolClient;
    try {
      await client.query("BEGIN");
      await client.query(file.sql);
      const checksum = recordChecksum ? computeChecksum(file.sql) : null;
      await client.query(
        `INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)`,
        [file.version, checksum]
      );
      await client.query("COMMIT");
      justApplied.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(
        `migration ${file.version} (${file.filename}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      client.release();
    }
  }

  return { applied: justApplied, skipped: alreadyApplied, pending: [] };
}

/**
 * dry-run 없이 적용 / 미적용 상태만 빠르게 조회할 때 사용.
 */
export async function listMigrations(
  pool: DatabasePool,
  options: { migrationsDir: string; to?: string }
): Promise<ApplyMigrationsResult> {
  await ensureSchemaMigrationsTable(pool);
  const applied = await readAppliedMigrations(pool);
  const appliedVersions = new Set(applied.map((m) => m.version));

  const files = listMigrationFiles(options.migrationsDir);
  const toFilter = files.filter((f) => isVersionWithinLimit(f.version, options.to));

  const skipped: MigrationFile[] = [];
  const pending: MigrationFile[] = [];
  for (const file of toFilter) {
    if (appliedVersions.has(file.version)) {
      skipped.push(file);
    } else {
      pending.push(file);
    }
  }
  return { applied: [], skipped, pending };
}