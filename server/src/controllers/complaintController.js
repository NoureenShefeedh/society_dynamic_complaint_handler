import pool from "../db/pool.js";
import { uploadPhoto } from "../utils/photoUpload.js";
import { computePriorityScore, isOverdue, calculateDaysOpen } from "../utils/priorityEngine.js";
import { classifySeverity } from "../utils/severityClassifier.js";

// POST /api/complaints
// Resident creates a complaint, optionally with a photo.
// Also writes the first complaint_history row (the "creation" event),
// so the history table is the single source of truth from day one.
export async function createComplaint(req, res) {
  const { category_id, description } = req.body;
  const residentId = req.user.id;

  if (!category_id || !description) {
    return res.status(400).json({ error: "category_id and description are required" });
  }

  const client = await pool.connect();

  try {
    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadPhoto(req.file, "complaints");
    }

    await client.query("BEGIN");

    // Fetch category weight — needed to compute the initial score
    const categoryResult = await client.query(
      "SELECT severity_weight FROM categories WHERE id = $1",
      [category_id]
    );
    if (categoryResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid category_id" });
    }
    const categorySeverityWeight = categoryResult.rows[0].severity_weight;

    // Count similar (same category) complaints raised recently, to detect
    // a recurring/systemic issue right at creation time
    const recurrenceResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM complaints
       WHERE category_id = $1 AND created_at >= now() - interval '14 days'`,
      [category_id]
    );
    const recentSimilarCount = recurrenceResult.rows[0].count;

    // Classify the complaint text itself for an initial severity signal —
    // this is what lets a "gas leak" complaint start high immediately,
    // not just after it's been sitting open for a few days.
    const initialSeverityScore = await classifySeverity(description);

    const { score, label } = computePriorityScore({
      categorySeverityWeight,
      createdAt: new Date(),
      recentSimilarCount,
      initialSeverityScore,
    });

    const complaintResult = await client.query(
      `INSERT INTO complaints (resident_id, category_id, description, photo_url, priority_score, priority_label, initial_severity_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [residentId, category_id, description, photoUrl, score, label, initialSeverityScore]
    );

    const complaint = complaintResult.rows[0];

    // First history row — no old_status, since this is the creation event
    await client.query(
      `INSERT INTO complaint_history (complaint_id, actor_id, old_status, new_status, priority_score_at_time, note)
       VALUES ($1, $2, NULL, 'Open', $3, 'Complaint raised')`,
      [complaint.id, residentId, complaint.priority_score]
    );

    await client.query("COMMIT");

    res.status(201).json({ complaint });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create complaint error:", err.message);
    res.status(500).json({ error: "Something went wrong while creating the complaint" });
  } finally {
    client.release();
  }
}

// GET /api/complaints/mine
// Resident views their own complaints, each with its full history.
export async function getMyComplaints(req, res) {
  try {
    const complaintsResult = await pool.query(
      `SELECT c.*, cat.name AS category_name
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       WHERE c.resident_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    const complaints = complaintsResult.rows;

    // Attach history to each complaint
    for (const complaint of complaints) {
      const historyResult = await pool.query(
        `SELECT h.*, u.name AS actor_name
         FROM complaint_history h
         JOIN users u ON u.id = h.actor_id
         WHERE h.complaint_id = $1
         ORDER BY h.created_at ASC`,
        [complaint.id]
      );
      complaint.history = historyResult.rows;
    }

    res.json({ complaints });
  } catch (err) {
    console.error("Get my complaints error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}

// GET /api/complaints
// Admin views all complaints, with optional filters: status, category_id, date range.
// Overdue complaints are sorted to the top, then by priority_score descending.
export async function getAllComplaints(req, res) {
  const { status, category_id, from_date, to_date } = req.query;

  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`c.status = $${paramIndex++}`);
    values.push(status);
  }
  if (category_id) {
    conditions.push(`c.category_id = $${paramIndex++}`);
    values.push(category_id);
  }
  if (from_date) {
    conditions.push(`c.created_at >= $${paramIndex++}`);
    values.push(from_date);
  }
  if (to_date) {
    conditions.push(`c.created_at <= $${paramIndex++}`);
    values.push(to_date);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT c.*, cat.name AS category_name, cat.severity_weight, cat.overdue_threshold_days,
              u.name AS resident_name, u.unit_number
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.resident_id
       ${whereClause}
       ORDER BY c.created_at ASC`,
      values
    );

    // Recalculate score, label, and overdue status live — this is what
    // makes priority rise naturally the longer a complaint sits open,
    // without needing a background cron job to "catch up" the numbers.
    const complaints = result.rows.map((c) => {
      const daysOpen = calculateDaysOpen(c.created_at);
      const { score, label } = computePriorityScore({
        categorySeverityWeight: c.severity_weight,
        createdAt: c.created_at,
        initialSeverityScore: c.initial_severity_score,
      });
      const overdue = isOverdue(daysOpen, c.overdue_threshold_days, c.status);

      return {
        ...c,
        priority_score: score,
        priority_label: label,
        is_overdue: overdue,
        days_open: Math.round(daysOpen * 10) / 10,
      };
    });

    // Sort: overdue first, then by score descending, then oldest first
    complaints.sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return b.is_overdue - a.is_overdue;
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    res.json({ complaints });
  } catch (err) {
    console.error("Get all complaints error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}

// GET /api/complaints/:id
// Single complaint with full history — used by both resident (own only) and admin (any).
export async function getComplaintById(req, res) {
  const { id } = req.params;

  try {
    const complaintResult = await pool.query(
      `SELECT c.*, cat.name AS category_name, u.name AS resident_name, u.unit_number
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.resident_id
       WHERE c.id = $1`,
      [id]
    );

    if (complaintResult.rows.length === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const complaint = complaintResult.rows[0];

    // A resident can only view their own complaint; admin can view any
    if (req.user.role === "resident" && complaint.resident_id !== req.user.id) {
      return res.status(403).json({ error: "You can only view your own complaints" });
    }

    const historyResult = await pool.query(
      `SELECT h.*, u.name AS actor_name
       FROM complaint_history h
       JOIN users u ON u.id = h.actor_id
       WHERE h.complaint_id = $1
       ORDER BY h.created_at ASC`,
      [id]
    );

    complaint.history = historyResult.rows;

    res.json({ complaint });
  } catch (err) {
    console.error("Get complaint by id error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}
