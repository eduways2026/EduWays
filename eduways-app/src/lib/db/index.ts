// src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres     from 'postgres';
import * as schema  from './schema';

// Singleton — reuse across hot reloads in dev
const g = globalThis as unknown as { _db?: ReturnType<typeof drizzle> };

const client = postgres(process.env.DATABASE_URL!, {
  max: process.env.NODE_ENV === 'production' ? 10 : 2,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = g._db ?? drizzle(client, { schema });
if (process.env.NODE_ENV !== 'production') g._db = db;
