import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type DatabasePool = Pool;

export function createDbPool(connectionString: string): Pool {
  return new Pool({
    connectionString
  });
}

export function createDbClientFromPool(pool: Pool) {
  return drizzle(pool);
}

export function createDbClient(connectionString: string) {
  const pool = createDbPool(connectionString);
  return createDbClientFromPool(pool);
}

export type DatabaseClient = ReturnType<typeof createDbClient>;
