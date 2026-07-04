// TASK-064 운영 baseline — postgres migration standalone CLI.
//
// 사용:
//
//   node --import tsx apps/build-server/scripts/migrate.ts \
//     --database-url postgres://postgres:postgres@127.0.0.1:15432/docker_image_builder \
//     --migrations-dir apps/build-server/migrations
//
//   # dry-run 으로 적용 계획만 확인
//   ... --dry-run
//
//   # 특정 version 까지만 적용 (e.g. 0002 까지)
//   ... --to 0002
//
//   # greenfield bootstrap DDL 도 함께 적용 (build-server 가 boot 시 호출
//   # 하는 경로와 동일)
//
// 환경변수 fallback:
//   - DATABASE_URL
//   - MIGRATIONS_DIR (default: apps/build-server/migrations)
//
// exit code: 0 (성공 / dry-run), 1 (적용 실패), 2 (인자 오류).

import { createDbPool, ensureDbSchema, applyMigrations, listMigrations, parseMigrationVersion } from "@docker-image-builder-system/db";

interface CliArgs {
  databaseUrl: string;
  migrationsDir: string;
  dryRun: boolean;
  to?: string;
  bootstrap: boolean;
  list: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    databaseUrl: process.env.DATABASE_URL ?? "",
    migrationsDir: process.env.MIGRATIONS_DIR ?? "apps/build-server/migrations",
    dryRun: false,
    bootstrap: false,
    list: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--database-url":
      case "-d":
        args.databaseUrl = argv[++i] ?? "";
        break;
      case "--migrations-dir":
      case "-m":
        args.migrationsDir = argv[++i] ?? "";
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--to": {
        const value = argv[++i];
        if (value === undefined || parseMigrationVersion(value) === null) {
          process.stderr.write(
            `invalid --to value: ${value ?? "(missing)"} (expected 4-digit numeric, e.g. 0002)\n`
          );
          process.exit(2);
        }
        args.to = value;
        break;
      }
      case "--bootstrap":
        args.bootstrap = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        process.stderr.write(`unknown argument: ${arg}\n`);
        process.exit(2);
    }
  }
  if (!args.databaseUrl) {
    process.stderr.write("--database-url or DATABASE_URL is required\n");
    process.exit(2);
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(`Usage: migrate.ts [options]

Options:
  -d, --database-url <url>   Postgres connection URL (or DATABASE_URL env)
  -m, --migrations-dir <dir> Migrations directory (or MIGRATIONS_DIR env)
      --dry-run               Show plan without applying
      --to <version>          Apply up to and including this version (e.g. 0002)
      --bootstrap             Also run ensureDbSchema greenfield DDL
      --list                  List applied/pending without applying
  -h, --help                 Show this help
`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const pool = createDbPool(args.databaseUrl);
  try {
    if (args.bootstrap) {
      await ensureDbSchema(pool);
    }
    if (args.list) {
      const result = await listMigrations(pool, {
        migrationsDir: args.migrationsDir,
        to: args.to
      });
      process.stdout.write(
        `applied: ${result.skipped.map((m) => m.version).join(", ") || "(none)"}\n`
      );
      process.stdout.write(
        `pending: ${result.pending.map((m) => m.version).join(", ") || "(none)"}\n`
      );
      return 0;
    }
    const result = await applyMigrations(pool, {
      migrationsDir: args.migrationsDir,
      dryRun: args.dryRun,
      to: args.to
    });
    const verb = args.dryRun ? "would apply" : "applied";
    process.stdout.write(
      `${verb}: ${result.applied.map((m) => m.version).join(", ") || "(none)"}\n`
    );
    process.stdout.write(
      `skipped: ${result.skipped.map((m) => m.version).join(", ") || "(none)"}\n`
    );
    process.stdout.write(
      `pending: ${result.pending.map((m) => m.version).join(", ") || "(none)"}\n`
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `migration failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  } finally {
    await pool.end();
  }
}

void main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `unhandled: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
);