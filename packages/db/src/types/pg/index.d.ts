declare module "pg" {
  export type QueryResult = {
    rows: unknown[];
  };

  export type PoolConfig = {
    connectionString?: string;
  };

  export class Pool {
    constructor(config?: PoolConfig);
    query(queryText: string): Promise<QueryResult>;
    end(): Promise<void>;
  }
}
