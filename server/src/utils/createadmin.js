// One-off script to create an admin account, since public signup only
// ever creates residents (on purpose — see authController.js).
//
// Usage:
//   node src/utils/createAdmin.js "Admin Name" admin@example.com "somePassword123"

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pool from "../db/pool.js";

dotenv.config();

async function createAdmin() {
  const [name, email, password] = process.argv.slice(2);

  if (!name || !email || !password) {
    console.error('Usage: node src/utils/createAdmin.js "Name" email@example.com password');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, name, email, role`,
      [name, email, passwordHash]
    );
    console.log("Admin created:", result.rows[0]);
  } catch (err) {
    console.error("Failed to create admin:", err.message);
  } finally {
    await pool.end();
  }
}

createAdmin();