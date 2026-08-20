import pool from "../db/pool.js";
import { uploadPhoto } from "../utils/photoUpload.js";

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

    const complaintResult = await client.query(
      `INSERT INTO complaints (resident_id, category_id, description, photo_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [residentId, category_id, description, photoUrl]
    );

    const complaint = complaintResult.rows[0];

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
      `SELECT c.*, cat.name AS category_name, u.name AS resident_name, u.unit_number
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.resident_id
       ${whereClause}
       ORDER BY c.is_overdue DESC, c.priority_score DESC, c.created_at ASC`,
      values
    );

    res.json({ complaints: result.rows });
  } catch (err) {
    console.error("Get all complaints error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
}

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