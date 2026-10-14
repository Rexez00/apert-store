// Usage: $env:DATABASE_URL='postgresql://...'; node scripts/db-check.mjs
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query('select version()');
console.log('DB OK:', r.rows[0].version.split(' ').slice(0, 2).join(' '));
await c.end();
console.log('CLOSED');
