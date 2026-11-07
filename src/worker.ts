// Check-worker entrypoint. Runs independently of the API process so probing
// load never competes with request handling.
import { startScheduler } from './checks/scheduler.js';
import { pool } from './db/index.js';

const stop = startScheduler();

async function shutdown() {
  stop();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
console.log('OpenStatusLayer check worker started');
