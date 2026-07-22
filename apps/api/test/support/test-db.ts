import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: join(__dirname, '../../../../.env.test') });

export async function conectarTestDb(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}
