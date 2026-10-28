import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
import type { DatabaseAdapter } from './types';
import { SqliteAdapter } from './sqlite';
import { PostgresAdapter } from './postgres';

export * from './types';

let dbInstance: DatabaseAdapter | null = null;
let dbStatusInfo = {
  configured: false,
  type: 'sqlite' as 'neon' | 'postgres' | 'sqlite',
  isFallback: false,
  fallbackReason: null as string | null,
};

export function getDbStatus() {
  return { ...dbStatusInfo };
}

export function resetDbInstance() {
  dbInstance = null;
}

export function setDbInstance(adapter: DatabaseAdapter | null) {
  dbInstance = adapter;
}

export async function getDb(): Promise<DatabaseAdapter> {
  if (dbInstance) {
    return dbInstance;
  }

  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    '';

  const connectionString = rawUrl.trim();

  if (connectionString) {
    const isNeon = connectionString.includes('neon.tech');
    const targetType = isNeon ? 'neon' : 'postgres';
    console.log(`🔌 Detected connection string for ${isNeon ? 'Neon Database (Postgres)' : 'PostgreSQL'}.`);
    console.log(`⏳ Connecting to ${isNeon ? 'Neon Database' : 'PostgreSQL'}...`);

    try {
      const pgAdapter = new PostgresAdapter(connectionString);
      await pgAdapter.init();
      console.log(`✅ Successfully connected to ${isNeon ? 'Neon Database' : 'PostgreSQL'}!`);

      dbInstance = pgAdapter;
      dbStatusInfo = {
        configured: true,
        type: targetType,
        isFallback: false,
        fallbackReason: null,
      };
      return dbInstance;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`⚠️ Failed to connect to ${isNeon ? 'Neon' : 'Postgres'} database: ${reason}`);
      console.warn(`➡️ Falling back to local SQLite database (bills.sqlite)...`);

      dbStatusInfo = {
        configured: true,
        type: 'sqlite',
        isFallback: true,
        fallbackReason: reason,
      };
    }
  } else {
    console.log(`ℹ️ No DATABASE_URL found in environment.`);
    console.log(`➡️ Using local SQLite database (bills.sqlite).`);
    console.log(`💡 Provide a Neon connection string in .env (DATABASE_URL=postgresql://...) to connect to Neon.`);

    dbStatusInfo = {
      configured: false,
      type: 'sqlite',
      isFallback: false,
      fallbackReason: null,
    };
  }

  const sqliteAdapter = new SqliteAdapter();
  await sqliteAdapter.init();
  dbInstance = sqliteAdapter;
  return dbInstance;
}
