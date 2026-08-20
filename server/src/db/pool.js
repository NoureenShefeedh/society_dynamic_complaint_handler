import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Use a pooled connection (Supabase's pooled URL, port 6543) so that
// serverless/free-tier restarts don't leave dangling connections.
// The pool also handles reconnects automatically on transient errors.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  // Don't crash the whole server on an idle client error (e.g. after a
  // free-tier DB wakes up from pause) — just log it.
  console.error("Unexpected DB pool error:", err.message);
});

export default pool;
