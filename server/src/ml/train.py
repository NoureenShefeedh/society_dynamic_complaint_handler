"""
Trains a lightweight text classifier that predicts a complaint's severity
score (1-10) from its description text alone, before any time-based or
recurrence factors are known. This is what lets a freshly-submitted
"gas leak" complaint start with a high priority immediately, instead of
only becoming high-priority after it's been open for a few days.

Approach: TF-IDF vectorization (bag-of-words weighted by term importance)
+ Linear Regression. This is intentionally simple — a few hundred labeled
examples isn't enough data to justify a deep learning approach, and
TF-IDF + linear regression is fast to train, fast to run, and easy to
explain in a design write-up.

Usage: python3 train.py
Produces: model.pkl (the trained pipeline, loaded by predict.py)
"""
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib

df = pd.read_csv("data/labeled_complaints.csv")

X_train, X_test, y_train, y_test = train_test_split(
    df["description"], df["severity_score"], test_size=0.2, random_state=42
)

pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(
        ngram_range=(1, 2),   # unigrams + bigrams, so "gas leak" is captured as a phrase
        max_features=500,
        stop_words="english",
    )),
    ("regressor", LinearRegression()),
])

pipeline.fit(X_train, y_train)

predictions = pipeline.predict(X_test)
mae = mean_absolute_error(y_test, predictions)
print(f"Trained on {len(X_train)} examples, tested on {len(X_test)}")
print(f"Mean Absolute Error on held-out test set: {mae:.2f} (scale is 1-10)")

joblib.dump(pipeline, "model.pkl")
print("Model saved to model.pkl")

# Quick sanity check with a few unseen examples
samples = [
    "There is a strong gas smell in the kitchen",
    "Corridor light bulb needs replacing",
    "Elevator is stuck with someone inside",
    "Garden bench is slightly wobbly",
]
print("\nSanity check on new examples:")
for s in samples:
    score = pipeline.predict([s])[0]
    print(f"  {score:.1f}  <-  \"{s}\"")
