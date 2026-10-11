#!/usr/bin/env python3
"""Generate deterministic synthetic food-service observations for pipeline demos only."""
from __future__ import annotations
import argparse
import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

CATEGORIES = {
    "Cooked Meals": (52.0, 7.5),
    "Bakery & Bread": (29.0, 4.2),
    "Fresh Produce": (41.0, 5.8),
}
BUSINESSES = [
    ("demo-restaurant", "Restaurant", 1.0),
    ("demo-grocery", "Grocery", 1.22),
]

def generate(days: int, seed: int):
    rng = random.Random(seed)
    start = date(2025, 1, 1)
    for business_id, business_type, scale in BUSINESSES:
        for category, (base, surplus_base) in CATEGORIES.items():
            previous_error = 0.0
            for offset in range(days):
                current = start + timedelta(days=offset)
                weekend = current.weekday() >= 5
                festival = current.month in (10, 11) and current.day in (20, 21, 22)
                promotion = offset % 17 == 0
                seasonal = math.sin(offset * 2 * math.pi / 30) * 2.5
                prepared = (base + (6 if weekend else 0) + seasonal + rng.gauss(0, 1.7)) * scale
                demand = prepared - (surplus_base + math.cos(offset * 0.37) * 1.6 + rng.gauss(0, 1.1))
                if promotion:
                    demand += prepared * 0.07
                if festival:
                    demand += prepared * 0.11
                demand = min(prepared, max(0, demand))
                leftover = max(0, prepared - demand)
                safe_donation = max(0, leftover - rng.uniform(0.25, 1.1))
                forecast = max(0, surplus_base + previous_error * 0.12)
                previous_error = forecast - leftover
                yield {
                    "business_id": business_id,
                    "business_type": business_type,
                    "category": category,
                    "date": current.isoformat(),
                    "day_of_week": current.weekday(),
                    "month": current.month,
                    "prepared_kg": round(prepared, 3),
                    "sold_kg": round(demand, 3),
                    "leftover_kg": round(leftover, 3),
                    "safe_donation_kg": round(safe_donation, 3),
                    "order_count": round(demand * rng.uniform(1.7, 2.5)),
                    "discount_percent": 10 if promotion else 0,
                    "promotion_active": int(promotion),
                    "holiday_or_festival": int(festival),
                    "previous_prediction_error": round(previous_error, 3),
                    "data_source": "SYNTHETIC_DEMO",
                }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", default="data/synthetic_sales.csv")
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    rows = list(generate(args.days, args.seed))
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} explicitly synthetic rows to {output}")

if __name__ == "__main__":
    main()
