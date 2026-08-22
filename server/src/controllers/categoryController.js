import pool from "../db/pool.js";

// GET /api/categories — any logged-in user
export async function getCategories(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, name, severity_weight, overdue_threshold_days FROM categories ORDER BY name"
    );
    res.json({ categories: result.rows });
  } catch (err) {
    console.error("Get categories error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}
