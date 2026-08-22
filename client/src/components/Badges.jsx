export function PriorityBadge({ label, score }) {
  const cls = (label || "Low").toLowerCase();
  return (
    <span className={`badge ${cls}`}>
      {label}
      {score !== undefined && score !== null && <span style={{ opacity: 0.75 }}> · {Number(score).toFixed(1)}</span>}
    </span>
  );
}

export function OverdueBadge() {
  return <span className="badge overdue">Overdue</span>;
}

export function StatusBadge({ status }) {
  return <span className="badge status">{status}</span>;
}