/** The part of D1 we use. Keeps the app free of Worker types. */
export type Db = {
  prepare(sql: string): { bind(...values: unknown[]): Statement };
  /** Runs the statements in one transaction. */
  batch(statements: Statement[]): Promise<unknown>;
};

export type Statement = {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
};
