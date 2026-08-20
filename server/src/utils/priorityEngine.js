// Priority Scoring Engine
//
// A complaint's priority is not a static admin-picked label — it's computed
// from three factors, recalculated on creation and whenever the admin views
// the complaint list, so priority naturally rises the longer something sits
// unresolved instead of needing a background job to "catch up."
//
//   priority_score = category_severity_weight + days_open_factor + recurrence_factor
//
// category_severity_weight : 1-10, set per category (categories.severity_weight)
// days_open_factor         : grows with time open, capped so it doesn't dominate forever
// recurrence_factor        : bonus if 3+ similar (same category) complaints were
//                             raised in the last 14 days — surfaces systemic issues
//
// The numeric score maps to a display label (Low/Medium/High) for the UI,
// but the raw score is what actually drives sort order on the admin board.

const DAYS_OPEN_MULTIPLIER = 1.5;
const DAYS_OPEN_CAP = 15;
const RECURRENCE_WINDOW_DAYS = 14;
const RECURRENCE_THRESHOLD_COUNT = 3;
const RECURRENCE_BONUS = 5;

export function calculateDaysOpen(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

export function scoreToLabel(score) {
  if (score >= 8) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

export function computePriorityScore({
  categorySeverityWeight,
  createdAt,
  recentSimilarCount = 0,
  initialSeverityScore = null,
}) {
  const daysOpen = calculateDaysOpen(createdAt);
  const daysOpenFactor = Math.min(daysOpen * DAYS_OPEN_MULTIPLIER, DAYS_OPEN_CAP);
  const recurrenceFactor =
    recentSimilarCount >= RECURRENCE_THRESHOLD_COUNT ? RECURRENCE_BONUS : 0;

  // Trust the classifier's read on the actual text when available — it
  // already captures urgency signal better than a static per-category
  // number. Averaging it down with category weight was diluting
  // genuinely urgent complaints (e.g. a gas leak scoring "Medium" just
  // because its category's fixed weight pulled the average down). This
  // is what lets a freshly-created complaint start at the right
  // priority immediately, not just after it's been open a while.
  const baseWeight =
    initialSeverityScore !== null ? initialSeverityScore : categorySeverityWeight;

  const score = baseWeight + daysOpenFactor + recurrenceFactor;

  return {
    score: Math.round(score * 100) / 100,
    label: scoreToLabel(score),
    daysOpen: Math.round(daysOpen * 10) / 10,
  };
}

export function isOverdue(daysOpen, overdueThresholdDays, status) {
  if (status === "Resolved") return false;
  return daysOpen > overdueThresholdDays;
}