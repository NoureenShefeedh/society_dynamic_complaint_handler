import pool from "../db/pool.js";
import { uploadPhoto } from "../utils/photoUpload.js";
import { computePriorityScore, isOverdue, calculateDaysOpen } from "../utils/priorityEngine.js";
import { classifySeverity } from "../utils/severityClassifier.js";
import { sendEmail } from "../utils/email.js";
import crypto from "crypto";

const RECURRENCE_LINK_THRESHOLD = 3;

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

    // If this is the 3rd+ similar complaint recently, link it and any
    // other unlinked recent similar complaints under a shared group so
    // the admin sees them as one recurring issue, not separate tickets.
    let recurrenceGroupId = null;
    if (recentSimilarCount + 1 >= RECURRENCE_LINK_THRESHOLD) {
      const existingGroupResult = await client.query(
        `SELECT recurrence_group_id FROM complaints
         WHERE category_id = $1 AND recurrence_group_id IS NOT NULL
           AND created_at >= now() - interval '14 days'
         LIMIT 1`,
        [category_id]
      );
      recurrenceGroupId =
        existingGroupResult.rows[0]?.recurrence_group_id || crypto.randomUUID();

      // Backfill the group onto any recent unlinked similar complaints too
      await client.query(
        `UPDATE complaints SET recurrence_group_id = $1
         WHERE category_id = $2 AND recurrence_group_id IS NULL
           AND created_at >= now() - interval '14 days'`,
        [recurrenceGroupId, category_id]
      );
    }

    const complaintResult = await client.query(
      `INSERT INTO complaints (resident_id, category_id, description, photo_url, priority_score, priority_label, initial_severity_score, recurrence_group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [residentId, category_id, description, photoUrl, score, label, initialSeverityScore, recurrenceGroupId]
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

// PATCH /api/complaints/:id/status
// Admin changes a complaint's status. Every change writes a new
// complaint_history row rather than just overwriting complaints.status,
// so the full lifecycle is always reconstructable.
//
// Moving to "Resolved" requires a resolution photo as proof of work —
// enforced here, not just suggested in the frontend.
export async function updateComplaintStatus(req, res) {
  const { id } = req.params;
  const { new_status, note } = req.body;
  const adminId = req.user.id;

  const validStatuses = ["Open", "In Progress", "Resolved"];
  if (!validStatuses.includes(new_status)) {
    return res.status(400).json({ error: `new_status must be one of: ${validStatuses.join(", ")}` });
  }

  const client = await pool.connect();

  try {
    const existingResult = await client.query("SELECT * FROM complaints WHERE id = $1", [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    const existing = existingResult.rows[0];

    // Resolving requires proof — a resolution photo — before/after style,
    // so "Resolved" means something more than an admin's word for it.
    let resolutionPhotoUrl = existing.resolution_photo_url;
    if (new_status === "Resolved") {
      if (!req.file) {
        return res.status(400).json({ error: "A resolution photo is required to mark a complaint as Resolved" });
      }
      resolutionPhotoUrl = await uploadPhoto(req.file, "resolutions");
    }

    await client.query("BEGIN");

    const updateResult = await client.query(
      `UPDATE complaints
       SET status = $1,
           resolution_photo_url = $2,
           resident_confirmed = CASE WHEN $1 = 'Resolved' THEN FALSE ELSE resident_confirmed END,
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [new_status, resolutionPhotoUrl, id]
    );

    const updated = updateResult.rows[0];

    await client.query(
      `INSERT INTO complaint_history (complaint_id, actor_id, old_status, new_status, priority_score_at_time, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, adminId, existing.status, new_status, updated.priority_score, note || null]
    );

    await client.query("COMMIT");

    // Notify the resident by email — failure here never breaks the request
    const residentResult = await pool.query("SELECT name, email FROM users WHERE id = $1", [updated.resident_id]);
    const resident = residentResult.rows[0];
    if (resident) {
      sendEmail(
        resident.email,
        `Your complaint status changed to ${new_status}`,
        `Hi ${resident.name},\n\nYour complaint "${updated.description}" is now: ${new_status}.\n${note ? `Note from admin: ${note}` : ""}`
      );
    }

    res.json({ complaint: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update status error:", err.message);
    res.status(500).json({ error: "Something went wrong while updating status" });
  } finally {
    client.release();
  }
}

// PATCH /api/complaints/:id/assign
// Admin assigns a staff member (plumber, electrician, etc.) to a complaint.
// Kept as a simple text field rather than its own login — logged to
// history so the record of who was dispatched and when is preserved.
export async function assignComplaint(req, res) {
  const { id } = req.params;
  const { assignee_name } = req.body;
  const adminId = req.user.id;

  if (!assignee_name) {
    return res.status(400).json({ error: "assignee_name is required" });
  }

  const client = await pool.connect();
  try {
    const existingResult = await client.query("SELECT * FROM complaints WHERE id = $1", [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    const existing = existingResult.rows[0];

    await client.query("BEGIN");

    const updateResult = await client.query(
      "UPDATE complaints SET assignee_name = $1, updated_at = now() WHERE id = $2 RETURNING *",
      [assignee_name, id]
    );

    await client.query(
      `INSERT INTO complaint_history (complaint_id, actor_id, old_status, new_status, priority_score_at_time, note)
       VALUES ($1, $2, $3, $3, $4, $5)`,
      [id, adminId, existing.status, existing.priority_score, `Assigned to ${assignee_name}`]
    );

    await client.query("COMMIT");
    res.json({ complaint: updateResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Assign complaint error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    client.release();
  }
}

// POST /api/complaints/:id/confirm
// Resident confirms a Resolved complaint is actually fixed. This is what
// makes "Resolved" mean something more than "the admin says so" — the
// person who raised the issue gets the final word before it's truly closed.
export async function confirmResolution(req, res) {
  const { id } = req.params;
  const residentId = req.user.id;

  const client = await pool.connect();

  try {
    const existingResult = await client.query("SELECT * FROM complaints WHERE id = $1", [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    const existing = existingResult.rows[0];

    if (existing.resident_id !== residentId) {
      return res.status(403).json({ error: "You can only confirm your own complaints" });
    }
    if (existing.status !== "Resolved") {
      return res.status(400).json({ error: "Only a Resolved complaint can be confirmed" });
    }

    await client.query("BEGIN");

    await client.query(
      `UPDATE complaints SET resident_confirmed = TRUE, updated_at = now() WHERE id = $1`,
      [id]
    );

    await client.query(
      `INSERT INTO complaint_history (complaint_id, actor_id, old_status, new_status, priority_score_at_time, note)
       VALUES ($1, $2, 'Resolved', 'Resolved', $3, 'Resident confirmed the fix')`,
      [id, residentId, existing.priority_score]
    );

    await client.query("COMMIT");

    res.json({ message: "Complaint confirmed as resolved" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Confirm resolution error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    client.release();
  }
}

// POST /api/complaints/:id/reopen
// Resident disputes a Resolved complaint — it goes back to "Reopened"
// (not a brand new complaint), preserving the full history instead of
// starting over. Admin will see it back on their active board.
export async function reopenComplaint(req, res) {
  const { id } = req.params;
  const { note } = req.body;
  const residentId = req.user.id;

  const client = await pool.connect();

  try {
    const existingResult = await client.query("SELECT * FROM complaints WHERE id = $1", [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    const existing = existingResult.rows[0];

    if (existing.resident_id !== residentId) {
      return res.status(403).json({ error: "You can only reopen your own complaints" });
    }
    if (existing.status !== "Resolved") {
      return res.status(400).json({ error: "Only a Resolved complaint can be reopened" });
    }

    await client.query("BEGIN");

    const updateResult = await client.query(
      `UPDATE complaints
       SET status = 'Reopened', resident_confirmed = FALSE, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query(
      `INSERT INTO complaint_history (complaint_id, actor_id, old_status, new_status, priority_score_at_time, note)
       VALUES ($1, $2, 'Resolved', 'Reopened', $3, $4)`,
      [id, residentId, existing.priority_score, note || "Resident reopened — issue not actually fixed"]
    );

    await client.query("COMMIT");

    res.json({ complaint: updateResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Reopen complaint error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    client.release();
  }
}
