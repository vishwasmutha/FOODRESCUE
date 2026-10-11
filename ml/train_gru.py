#!/usr/bin/env python3
"""Train and evaluate the FoodRescue demo GRU on explicitly synthetic or user-provided CSV data.

The script never random-splits time-series rows. Scalers fit on training data only.
A model is saved only after evaluation; deployment remains a separate manual decision.
"""
from __future__ import annotations
import argparse
import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.preprocessing import StandardScaler
import joblib

FEATURES = [
    "day_of_week", "month", "prepared_kg", "sold_kg", "leftover_kg",
    "order_count", "discount_percent", "promotion_active",
    "holiday_or_festival", "previous_prediction_error",
]
TARGET = "leftover_kg"
SEQUENCE_LENGTH = 14

def validate_and_clean(frame: pd.DataFrame) -> pd.DataFrame:
    missing = {"business_id", "category", "date", *FEATURES} - set(frame.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")
    data = frame.copy()
    data["date"] = pd.to_datetime(data["date"], errors="raise", utc=True)
    data = data.sort_values(["business_id", "category", "date"]).drop_duplicates(["business_id", "category", "date"])
    for column in FEATURES:
        data[column] = pd.to_numeric(data[column], errors="coerce")
        data[column] = data.groupby(["business_id", "category"])[column].transform(lambda values: values.interpolate(limit_direction="both"))
        data[column] = data[column].fillna(data[column].median()).clip(lower=0 if column not in ("previous_prediction_error",) else None)
        lower, upper = data[column].quantile([0.01, 0.99])
        data[column] = data[column].clip(lower, upper)
    return data

def split_dates(data: pd.DataFrame):
    dates = np.array(sorted(data["date"].unique()))
    if len(dates) < 60:
        raise ValueError("At least 60 chronological dates are required")
    train_end = dates[int(len(dates) * 0.70) - 1]
    validation_end = dates[int(len(dates) * 0.85) - 1]
    return train_end, validation_end

def make_sequences(data, scaler, category_columns, start_date=None, end_date=None):
    x_values, y_values, metadata = [], [], []
    feature_columns = FEATURES + category_columns
    for (business_id, category), group in data.groupby(["business_id", "category"], sort=False):
        group = group.sort_values("date").reset_index(drop=True)
        scaled = scaler.transform(group[feature_columns])
        for index in range(SEQUENCE_LENGTH, len(group)):
            target_date = group.loc[index, "date"]
            if start_date is not None and target_date <= start_date:
                continue
            if end_date is not None and target_date > end_date:
                continue
            x_values.append(scaled[index-SEQUENCE_LENGTH:index])
            y_values.append(group.loc[index, TARGET])
            metadata.append((business_id, category, target_date))
    return np.asarray(x_values, dtype=np.float32), np.asarray(y_values, dtype=np.float32), metadata

def metrics(actual, predicted):
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(mean_squared_error(actual, predicted) ** 0.5),
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/synthetic_sales.csv")
    parser.add_argument("--output", default="artifacts/gru-demo")
    parser.add_argument("--epochs", type=int, default=45)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    os.environ["TF_DETERMINISTIC_OPS"] = "1"
    random.seed(args.seed)
    np.random.seed(args.seed)
    try:
        import tensorflow as tf
        from tensorflow import keras
    except ImportError as error:
        raise SystemExit("TensorFlow is not installed. Install ml/requirements.txt in a Python 3.11 environment.") from error
    tf.random.set_seed(args.seed)

    raw = pd.read_csv(args.data)
    data = validate_and_clean(raw)
    source_labels = sorted(set(raw.get("data_source", pd.Series(["UNLABELLED"])).astype(str)))
    train_end, validation_end = split_dates(data)
    encoded = pd.get_dummies(data, columns=["category"], prefix="category", dtype=float)
    category_columns = [column for column in encoded if column.startswith("category_")]
    training_rows = encoded[encoded["date"] <= train_end]
    scaler = StandardScaler().fit(training_rows[FEATURES + category_columns])
    x_train, y_train, _ = make_sequences(encoded, scaler, category_columns, end_date=train_end)
    x_validation, y_validation, _ = make_sequences(encoded, scaler, category_columns, start_date=train_end, end_date=validation_end)
    x_test, y_test, test_meta = make_sequences(encoded, scaler, category_columns, start_date=validation_end)
    if min(len(x_train), len(x_validation), len(x_test)) == 0:
        raise ValueError("One or more chronological splits produced no sequences")

    model = keras.Sequential([
        keras.layers.Input((SEQUENCE_LENGTH, x_train.shape[-1])),
        keras.layers.GRU(48, return_sequences=True, dropout=0.15),
        keras.layers.GRU(24, dropout=0.10),
        keras.layers.Dense(16, activation="relu"),
        keras.layers.Dense(1, activation="softplus"),
    ])
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=1e-3), loss="huber", metrics=["mae"])
    callbacks = [keras.callbacks.EarlyStopping(monitor="val_loss", patience=7, restore_best_weights=True)]
    history = model.fit(x_train, y_train, validation_data=(x_validation, y_validation), epochs=args.epochs, batch_size=32, shuffle=False, verbose=2, callbacks=callbacks)
    prediction = model.predict(x_test, verbose=0).reshape(-1)

    # Seasonal-naive baseline uses the same category/business value seven observations prior.
    baseline = []
    for business_id, category, target_date in test_meta:
        prior = data[(data.business_id == business_id) & (data.category == category) & (data.date < target_date)].sort_values("date")
        baseline.append(float(prior.iloc[-7][TARGET] if len(prior) >= 7 else prior[TARGET].median()))
    validation_prediction = model.predict(x_validation, verbose=0).reshape(-1)
    residual_quantile = float(np.quantile(np.abs(y_validation - validation_prediction), 0.80))
    report = {
        "label": "Synthetic demo evaluation" if "SYNTHETIC_DEMO" in source_labels else "User-provided data evaluation",
        "data_sources": source_labels,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "sequence_length": SEQUENCE_LENGTH,
        "features": FEATURES + category_columns,
        "split": {"strategy": "chronological 70/15/15", "train_end": str(train_end), "validation_end": str(validation_end), "train_sequences": len(x_train), "validation_sequences": len(x_validation), "test_sequences": len(x_test)},
        "gru": metrics(y_test, prediction),
        "seasonal_naive": metrics(y_test, np.asarray(baseline)),
        "interval": {"method": "80% absolute validation residual", "half_width_kg": residual_quantile},
        "epochs_completed": len(history.history["loss"]),
        "deployment_status": "EVALUATED_NOT_DEPLOYED",
    }
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    model.save(output / "model.keras")
    joblib.dump(scaler, output / "scaler.joblib")
    (output / "metadata.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
