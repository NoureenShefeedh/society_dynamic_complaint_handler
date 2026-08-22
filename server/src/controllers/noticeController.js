import pool from "../db/pool.js";
import { sendEmail } from "../utils/email.js";

// POST /api/notices — admin only
export async function createNotice(req, res) {
  const { title, body, is_important } = req.body;
  const adminId = req.user.id;

  if (!title || !body) {
    return res.status(400).json({ error: "title and body are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO notices (posted_by, title, body, is_important)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [adminId, title, body, !!is_important]
    );
    const notice = result.rows[0];

    // Email all residents when a notice is marked important
    if (notice.is_important) {
      const residents = await pool.query("SELECT email, name FROM users WHERE role = 'resident'");
      for (const r of residents.rows) {
        sendEmail(r.email, `Important notice: ${title}`, body);
      }
    }

    res.status(201).json({ notice });
  } catch (err) {
    console.error("Create notice error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}

// GET /api/notices — any logged-in user, pinned/important notices first
export async function getNotices(req, res) {
  try {
    const result = await pool.query(
      `SELECT n.*, u.name AS posted_by_name FROM notices n
       JOIN users u ON u.id = n.posted_by
       ORDER BY n.is_important DESC, n.created_at DESC`
    );
    res.json({ notices: result.rows });
  } catch (err) {
    console.error("Get notices error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}
