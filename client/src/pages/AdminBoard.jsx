import { useEffect, useState } from "react";
import api from "../api/axios.js";
import { PriorityBadge, OverdueBadge } from "../components/Badges.jsx";

const COLUMNS = ["Open", "In Progress", "Resolved", "Reopened"];

export default function AdminBoard() {
  const [complaints, setComplaints] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", category_id: "" });
  const [selected, setSelected] = useState(null);

  async function loadData() {
    setLoading(true);
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.category_id) params.category_id = filters.category_id;

    const [compRes, catRes] = await Promise.all([
      api.get("/api/complaints", { params }),
      api.get("/api/categories"),
    ]);
    setComplaints(compRes.data.complaints);
    setCategories(catRes.data.categories);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.category_id]);

  function complaintsFor(status) {
    return complaints.filter((c) => c.status === status);
  }

  return (
    <div className="main">
      <div className="page-header">
        <div>
          <h1>Complaint board</h1>
          <p>Overdue and high-priority complaints surface to the top of each column automatically.</p>
        </div>
      </div>

      <div className="filters-bar">
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {COLUMNS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.category_id} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading complaints…</div>
      ) : (
        <div className="board">
          {COLUMNS.map((status) => (
            <div className="board-column" key={status}>
              <h3>{status} <span>{complaintsFor(status).length}</span></h3>
              {complaintsFor(status).map((c) => (
                               <div
                  key={c.id}
                  className={`ticket priority-${(c.priority_label || "low").toLowerCase() === "critical" ? "high" : (c.priority_label || "low").toLowerCase()}`}
                  onClick={() => setSelected(c)}
                >
                  <div className="ticket-top">
                    <div className="ticket-id">#{c.id.slice(0, 8)}</div>
                    {c.is_overdue && <OverdueBadge />}
                  </div>
                  <div className="ticket-desc">{c.description}</div>
                  <div className="ticket-meta">
                    <PriorityBadge label={c.priority_label} score={c.priority_score} />
                    <span>{c.category_name}</span>
                    <span>{c.unit_number || "—"}</span>
                  </div>
                  {c.recurrence_group_id && (
                    <div style={{ fontSize: "0.7rem", color: "var(--red)", marginTop: "0.3rem" }}>
                      ⚠ Part of a recurring issue
                    </div>
                  )}
                </div>
              ))}
              {complaintsFor(status).length === 0 && (
                <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)", padding: "0.5rem" }}>Nothing here</div>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <ComplaintModal
          complaint={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); loadData(); }}
        />
      )}
    </div>
  );
}

function ComplaintModal({ complaint, onClose, onUpdated }) {
  const [newStatus, setNewStatus] = useState(complaint.status);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);
  const [assignee, setAssignee] = useState(complaint.assignee_name || "");
  const [full, setFull] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/api/complaints/${complaint.id}`).then((res) => setFull(res.data.complaint));
  }, [complaint.id]);

  async function handleStatusUpdate(e) {
    e.preventDefault();
    setError("");
    if (newStatus === "Resolved" && !photo) {
      setError("A resolution photo is required to mark this as Resolved.");
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("new_status", newStatus);
      formData.append("note", note);
      if (photo) formData.append("photo", photo);

      await api.patch(`/api/complaints/${complaint.id}/status`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    if (!assignee.trim()) return;
    await api.patch(`/api/complaints/${complaint.id}/assign`, { assignee_name: assignee });
    onUpdated();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>#{complaint.id.slice(0, 8)}</h2>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>

        <p><strong>{complaint.category_name}</strong> — {complaint.resident_name} ({complaint.unit_number || "—"})</p>
        <p>{complaint.description}</p>
        {complaint.photo_url && <img src={complaint.photo_url} alt="Complaint" className="thumb" />}

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleStatusUpdate} style={{ marginTop: "1rem" }}>
          <div className="field">
            <label>Update status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option>Open</option>
              <option>In Progress</option>
              <option>Resolved</option>
            </select>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Plumber dispatched" />
          </div>
          {newStatus === "Resolved" && (
            <div className="field">
              <label>Resolution photo (required)</label>
              <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
            </div>
          )}
          <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save status"}</button>
        </form>

        <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
          <label>Assign staff</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. Ramesh (Plumber)" />
            <button className="secondary" onClick={handleAssign}>Assign</button>
          </div>
        </div>

        {full?.history && (
          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
            <strong style={{ fontSize: "0.85rem" }}>Full history</strong>
            {full.history.map((h) => (
              <div className="history-item" key={h.id}>
                <div className="when">{new Date(h.created_at).toLocaleString()} — {h.actor_name}</div>
                <div>{h.old_status ? `${h.old_status} → ${h.new_status}` : `Created as ${h.new_status}`}</div>
                {h.note && <div style={{ color: "var(--ink-soft)" }}>{h.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
