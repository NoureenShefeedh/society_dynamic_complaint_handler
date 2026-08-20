"""
Loads the trained model and predicts a severity score for a single piece
of complaint text, passed as a command-line argument. Outputs JSON to
stdout so the Node backend can parse it directly.

Usage: python3 predict.py "There is a gas smell in the kitchen"
Output: {"severity_score": 8.9}
"""
import sys
import json
import joblib

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No description text provided"}))
        sys.exit(1)

    description = sys.argv[1]

    try:
        model = joblib.load("model.pkl")
    except FileNotFoundError:
        print(json.dumps({"error": "model.pkl not found — run train.py first"}))
        sys.exit(1)

    raw_score = model.predict([description])[0]
    # Clamp to the valid 1-10 range — the regression model can technically
    # predict slightly outside it on unusual inputs
    clamped_score = max(1.0, min(10.0, raw_score))

    print(json.dumps({"severity_score": round(float(clamped_score), 2)}))

if __name__ == "__main__":
    main()
