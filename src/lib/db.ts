import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { parse } from 'pg-connection-string';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const dbConfig = parse(process.env.DATABASE_URL || '');

const conn = globalForDb.conn ?? new Pool({
  host: dbConfig.host || undefined,
  port: dbConfig.port ? parseInt(dbConfig.port, 10) : undefined,
  user: dbConfig.user || undefined,
  password: dbConfig.password || undefined,
  database: dbConfig.database || undefined,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10, // Limit connections for serverless environments
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

if (process.env.NODE_ENV !== 'production') {
  globalForDb.conn = conn;
}

export const db = drizzle(conn, { schema });
export type Database = typeof db;
