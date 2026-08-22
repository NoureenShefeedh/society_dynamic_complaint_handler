import pool from "../db/pool.js";
import { calculateDaysOpen, isOverdue } from "../utils/priorityEngine.js";

// GET /api/dashboard — admin only
export async function getDashboardStats(req, res) {
  try {
    const byStatusResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM complaints GROUP BY status`
    );

    const byCategoryResult = await pool.query(
      `SELECT cat.name AS category, COUNT(*)::int AS count
       FROM complaints c JOIN categories cat ON cat.id = c.category_id
       GROUP BY cat.name ORDER BY count DESC`
    );

    // Recompute overdue live (same logic as the complaint list) rather
    // than trusting a possibly-stale is_overdue column
    const openComplaints = await pool.query(
      `SELECT c.created_at, c.status, cat.overdue_threshold_days
       FROM complaints c JOIN categories cat ON cat.id = c.category_id
       WHERE c.status != 'Resolved'`
    );
    const overdueCount = openComplaints.rows.filter((c) =>
      isOverdue(calculateDaysOpen(c.created_at), c.overdue_threshold_days, c.status)
    ).length;

    // Bonus: which unit/block generates the most complaints, and average
    // resolution time per category — real facility-management-style insight
    const byUnitResult = await pool.query(
      `SELECT u.unit_number, COUNT(*)::int AS count
       FROM complaints c JOIN users u ON u.id = c.resident_id
       WHERE u.unit_number IS NOT NULL
       GROUP BY u.unit_number ORDER BY count DESC LIMIT 5`
    );

    const avgResolutionResult = await pool.query(
      `SELECT cat.name AS category,
              ROUND(AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at)) / 86400)::numeric, 1) AS avg_days
       FROM complaints c JOIN categories cat ON cat.id = c.category_id
       WHERE c.status = 'Resolved'
       GROUP BY cat.name`
    );

    res.json({
      by_status: byStatusResult.rows,
      by_category: byCategoryResult.rows,
      overdue_count: overdueCount,
      top_units_by_complaints: byUnitResult.rows,
      avg_resolution_days_by_category: avgResolutionResult.rows,
    });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}
