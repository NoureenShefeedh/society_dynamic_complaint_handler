import { useEffect, useState } from "react";
import api from "../api/axios.js";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/dashboard").then((res) => {
      setStats(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="main"><div className="loading">Loading dashboard…</div></div>;

  const totalComplaints = stats.by_status.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="main">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>A snapshot of complaint volume, overdue items, and resolution trends.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="num">{totalComplaints}</div>
          <div className="label">Total complaints</div>
        </div>
        <div className="card stat-card">
          <div className="num" style={{ color: "var(--red)" }}>{stats.overdue_count}</div>
          <div className="label">Overdue right now</div>
        </div>
        {stats.by_status.map((s) => (
          <div className="card stat-card" key={s.status}>
            <div className="num">{s.count}</div>
            <div className="label">{s.status}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <div className="card">
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.9rem" }}>By category</h3>
          {stats.by_category.map((c) => (
            <BarRow key={c.category} label={c.category} value={c.count} max={Math.max(...stats.by_category.map(x => x.count))} />
          ))}
        </div>

        <div className="card">
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.9rem" }}>Top units by complaint count</h3>
          {stats.top_units_by_complaints.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Not enough data yet.</p>
          ) : (
            stats.top_units_by_complaints.map((u) => (
              <BarRow key={u.unit_number} label={u.unit_number} value={u.count} max={Math.max(...stats.top_units_by_complaints.map(x => x.count))} />
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.9rem" }}>Average resolution time by category</h3>
        {stats.avg_resolution_days_by_category.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>No resolved complaints yet.</p>
        ) : (
          stats.avg_resolution_days_by_category.map((r) => (
            <div key={r.category} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--line)", fontSize: "0.88rem" }}>
              <span>{r.category}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{r.avg_days} days</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BarRow({ label, value, max }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: "0.7rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "0.25rem" }}>
        <span>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>{value}</span>
      </div>
      <div style={{ background: "var(--slate-soft)", borderRadius: 4, height: 6 }}>
        <div style={{ width: `${pct}%`, background: "var(--amber)", height: "100%", borderRadius: 4 }} />
      </div>
    </div>
  );
}
