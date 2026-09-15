import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';

const runMigration = async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set in environment variables.');
  }

  const sql = neon(dbUrl);
  const db = drizzle(sql);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations applied successfully!');
};

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});