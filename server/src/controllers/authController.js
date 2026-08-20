import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// POST /api/auth/signup
// Residents self-register. Admin accounts should be created directly in
// the DB (or via a separate seeded/protected flow) rather than open signup,
// so the role is forced to "resident" here regardless of what's sent.
export async function signup(req, res) {
  const { name, email, password, unit_number } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, unit_number)
       VALUES ($1, $2, $3, 'resident', $4)
       RETURNING id, name, email, role, unit_number, created_at`,
      [name, email, passwordHash, unit_number || null]
    );

    const user = result.rows[0];
    const token = signToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ error: "Something went wrong during signup" });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        unit_number: user.unit_number,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Something went wrong during login" });
  }
}

// GET /api/auth/me — return the logged-in user's own profile
export async function getProfile(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, unit_number, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Get profile error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}