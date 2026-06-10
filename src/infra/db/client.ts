import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

let db: Db | null = null;

/**
 * Lazy singleton: the pool is created on first use, not at import time, so
 * importing this module in tests or at build time never opens a connection.
 */
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env first.');
  }
  db = drizzle(new Pool({ connectionString: url }), { schema });
  return db;
}
