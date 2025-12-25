import { Pool, PoolClient } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

// Load .env files for other config (DFLOW_API_KEY, etc.)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Always use Docker postgres credentials (from docker-compose.yml)
// Override any DATABASE_URL from .env since it may have different credentials
const DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/trades';

console.log('[DB] Connecting to:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

export const db = {
  query: <T = any>(text: string, params?: any[]) => pool.query<T>(text, params),
  getClient: (): Promise<PoolClient> => pool.connect(),
  pool,
};

export default db;

