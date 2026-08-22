import { useEffect, useState } from "react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function NoticeBoard() {
  const { user } = useAuth();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function loadNotices() {
    setLoading(true);
    const res = await api.get("/api/notices");
    setNotices(res.data.notices);
    setLoading(false);
  }

  useEffect(() => {
    loadNotices();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/api/notices", { title, body, is_important: isImportant });
      setTitle("");
      setBody("");
      setIsImportant(false);
      setShowForm(false);
      await loadNotices();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="main">
      <div className="page-header">
        <div>
          <h1>Notice board</h1>
          <p>Important notices are pinned to the top and emailed to all residents.</p>
        </div>
        {user.role === "admin" && (
          <button onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Post notice"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label>Body</label>
              <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
            <div className="field" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={isImportant}
                onChange={(e) => setIsImportant(e.target.checked)}
                id="important"
              />
              <label htmlFor="important" style={{ margin: 0 }}>Mark as important (pins to top, emails all residents)</label>
            </div>
            <button type="submit" disabled={submitting}>{submitting ? "Posting..." : "Post notice"}</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading notices…</div>
      ) : notices.length === 0 ? (
        <div className="empty-state">No notices yet.</div>
      ) : (
        notices.map((n) => (
          <div key={n.id} className={`card notice ${n.is_important ? "important" : ""}`}>
            <h4>{n.is_important && "📌 "}{n.title}</h4>
            <p>{n.body}</p>
            <div className="meta">{n.posted_by_name} — {new Date(n.created_at).toLocaleString()}</div>
          </div>
        ))
      )}
    </div>
  );
}
