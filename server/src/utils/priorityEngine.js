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
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
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

  const parsedInitialSeverity =
    initialSeverityScore !== null && initialSeverityScore !== undefined
      ? Number(initialSeverityScore)
      : null;
  const parsedCategoryWeight = Number(categorySeverityWeight);

  const baseWeight =
    parsedInitialSeverity !== null && !Number.isNaN(parsedInitialSeverity)
      ? parsedInitialSeverity
      : parsedCategoryWeight;

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