import 'dotenv/config';
import { createApp } from './app.js';
import { createDatabasePool } from './database/pool.js';
import { PostgresEmployeeRepository } from './modules/employees/postgres-employee.repository.js';

async function start(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = createDatabasePool(connectionString);

  try {
    await pool.query('SELECT 1');

    const repository = new PostgresEmployeeRepository(pool);
    const app = createApp(repository);
    const port = Number(process.env.PORT ?? 3000);

    app.listen(port, () => {
      console.log(`LearnBridge API listening on port ${port}`);
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
}

start().catch((error: unknown) => {
  console.error('Failed to start LearnBridge:', error);
  process.exitCode = 1;
});
