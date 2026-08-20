import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ML_DIR = path.join(__dirname, "../ml");

// Calls the trained Python classifier to get an initial severity score
// (1-10) for a complaint's description text, purely from its wording —
// before any time-open or recurrence factors exist. If the classifier
// is unavailable for any reason (Python not installed, model not
// trained yet, etc.), we fail gracefully and return null so the
// priority engine just falls back to category weight alone rather
// than crashing complaint creation.
export async function classifySeverity(description) {
  try {
    const { stdout } = await execFileAsync(
      "python3",
      ["predict.py", description],
      { cwd: ML_DIR, timeout: 5000 }
    );

    const result = JSON.parse(stdout.trim());

    if (result.error) {
      console.warn("Classifier warning:", result.error);
      return null;
    }

    return result.severity_score;
  } catch (err) {
    console.warn("Severity classifier unavailable, falling back to category weight only:", err.message);
    return null;
  }
}
