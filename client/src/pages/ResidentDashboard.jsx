import { useEffect, useState } from "react";
import api from "../api/axios.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.jsx";

export default function ResidentDashboard() {
  const [categories, setCategories] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    const [catRes, compRes] = await Promise.all([
      api.get("/api/categories"),
      api.get("/api/complaints/mine"),
    ]);
    setCategories(catRes.data.categories);
    setComplaints(compRes.data.complaints);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("category_id", categoryId);
      formData.append("description", description);
      if (photo) formData.append("photo", photo);

      await api.post("/api/complaints", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setSuccess("Complaint raised successfully.");
      setDescription("");
      setCategoryId("");
      setPhoto(null);
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(id) {
    await api.post(`/api/complaints/${id}/confirm`);
    await loadData();
  }

  async function handleReopen(id) {
    const note = window.prompt("What's still wrong with this complaint?");
    if (note === null) return;
    await api.post(`/api/complaints/${id}/reopen`, { note });
    await loadData();
  }

  return (
    <div className="main">
      <div className="page-header">
        <div>
          <h1>My complaints</h1>
          <p>Raise a new issue or track the status of ones you've already reported.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ Raise a complaint"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail — specific wording helps us route it correctly."
                required
              />
            </div>
            <div className="field">
              <label>Photo (optional)</label>
              <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
            </div>
            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit complaint"}
            </button>
          </form>
        </div>
      )}

      {success && <div className="success-banner">{success}</div>}

      {loading ? (
        <div className="loading">Loading your complaints…</div>
      ) : complaints.length === 0 ? (
        <div className="empty-state">You haven't raised any complaints yet.</div>
      ) : (
        complaints.map((c) => (
          <div
            key={c.id}
                        className={`ticket priority-${(c.priority_label || "low").toLowerCase() === "critical" ? "high" : (c.priority_label || "low").toLowerCase()}`}
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
          >
            <div className="ticket-top">
              <div>
                <div className="ticket-id">#{c.id.slice(0, 8)} · {c.category_name}</div>
                <div className="ticket-desc">{c.description}</div>
              </div>
                            <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                <PriorityBadge label={c.priority_label} score={c.priority_score} />
                <StatusBadge status={c.status} />
              </div>
            </div>

            {c.photo_url && (
              <img src={c.photo_url} alt="Complaint" className="thumb" style={{ maxWidth: 160 }} />
            )}

            {expandedId === c.id && (
              <div style={{ marginTop: "0.9rem", borderTop: "1px solid var(--line)", paddingTop: "0.9rem" }}>
                <strong style={{ fontSize: "0.85rem" }}>History</strong>
                {c.history?.map((h) => (
                  <div className="history-item" key={h.id}>
                    <div className="when">{new Date(h.created_at).toLocaleString()} — {h.actor_name}</div>
                    <div>{h.old_status ? `${h.old_status} → ${h.new_status}` : `Created as ${h.new_status}`}</div>
                    {h.note && <div style={{ color: "var(--ink-soft)" }}>{h.note}</div>}
                  </div>
                ))}

                {c.status === "Resolved" && !c.resident_confirmed && (
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleConfirm(c.id)}>Confirm it's fixed</button>
                    <button className="secondary" onClick={() => handleReopen(c.id)}>Not actually fixed</button>
                  </div>
                )}

                {c.resolution_photo_url && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <strong style={{ fontSize: "0.85rem" }}>Proof of resolution</strong>
                    <img src={c.resolution_photo_url} alt="Resolution proof" className="thumb" style={{ maxWidth: 200 }} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
