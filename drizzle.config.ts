import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { parse } from 'pg-connection-string';

// Load environment variables for Drizzle CLI
dotenv.config({ path: '.env.local' });

const dbConfig = parse(process.env.DATABASE_URL || '');

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: dbConfig.host || '',
    port: dbConfig.port ? parseInt(dbConfig.port, 10) : 5432,
    user: dbConfig.user || '',
    password: dbConfig.password || '',
    database: dbConfig.database || '',
    ssl: {
      rejectUnauthorized: false,
    },
  },
});
