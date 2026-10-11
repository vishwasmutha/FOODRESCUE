# FoodRescue AI

An end-to-end demonstration platform for forecasting food surplus, extracting structured donation details from natural language, ranking eligible recipients, reserving quantities transactionally, coordinating pickup, and measuring completed rescue outcomes.

> **Demo disclosure:** seeded organizations, locations, historical observations, distances, donations, and outcomes are synthetic. No NGO partnership, route estimate, food-safety assessment, or production model accuracy is claimed.

## Architecture choice

The supplied runtime is Next.js App Router + PostgreSQL/Drizzle, so the MVP uses a single deployable TypeScript application rather than the requested Vite/FastAPI split. REST route boundaries are documented in `docs/API.md`; the Python GRU pipeline remains an offline, independently deployable model service candidate. This avoids two overlapping persistence layers while preserving a clean future service boundary.

## Implemented

- Cookie sessions, PBKDF2 password hashing, role guards, object-level authorization, and audit records.
- Normalized PostgreSQL schema for users, organizations, constraints, history, models, predictions, donations, offers, reservations, pickups, notifications, feedback, settings, and audit logs.
- Transactional acceptance with database row locks, unique offer reservations, quantity/capacity checks, and cancellation release.
- Donation state workflow through available, offered, accepted, pickup, completion, partial completion, cancellation, and expiry states.
- Rule-assisted NLP with explicit evidence/confidence, quantity/unit conversion, food/category/diet/time/storage extraction, and unknown-field clarification.
- Hard-filter-first matching followed by configurable compatibility/capacity/timing/distance/semantic ranking with score explanations.
- Deterministic seasonal-naive runtime forecast, chronological holdout evaluation, intervals, factors, and 1–7 day category output.
- Offline Python GRU pipeline with train-only scaling, chronological 70/15/15 splits, early stopping, baseline comparison, metadata, and artifact saving.
- Business, NGO, and admin dashboards; forecast studio; NLP review; offers; live lifecycle; history; impact; requirements; settings; notifications; verification and audit.
- In-app notification polling fallback. Email, FCM, mapping, and weather remain optional adapters.

## Prerequisites

- Node.js 22+
- PostgreSQL 15+
- Python 3.11 only if training the GRU

## Local setup

```bash
npm install
cp .env.example .env
# Create app_db, then:
npx drizzle-kit push
npx tsx scripts/seed-demo.ts
npm run dev
```

Open `http://localhost:3000`. Timestamps are stored in UTC and presented in the India-oriented UI using `Asia/Kolkata`.

## Demo accounts

All use password `Demo@123`.

| Role | Email |
|---|---|
| Business | `donor@foodrescue.demo` |
| NGO | `ngo@foodrescue.demo` |
| Additional NGO | `kitchen@foodrescue.demo` |
| Administrator | `admin@foodrescue.demo` |

Public registration permits only business or NGO roles. Create the first production administrator through a controlled server-side provisioning process, never a public endpoint.

## Validation and tests

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npx tsx --test tests/core.test.ts
npm run build
```

The latest development run executed 9 core NLP, forecast, safety, and matching tests successfully. API/database concurrency should also be stress-tested in the target deployment; row locks and unique constraints are implemented but the demo test suite does not claim a production load test.

## Synthetic data and ML

Generate the same labelled CSV deterministically:

```bash
python3 ml/generate_synthetic.py --days 365 --seed 42 --output data/synthetic_sales.csv
```

Train in an isolated Python 3.11 environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/train_gru.py --data data/synthetic_sales.csv --output artifacts/gru-demo --epochs 45
```

The training command writes `model.keras`, `scaler.joblib`, and `metadata.json`. It does **not** deploy automatically. Review holdout metrics against the seasonal baseline before controlled deployment. No neural model training was executed for this delivery, and no neural accuracy result is claimed.

## Production environment

```bash
npm run build
npm run start
```

Use a TLS reverse proxy, managed PostgreSQL, secret manager, backup policy, external rate limiter, CSRF strategy for cross-origin deployments, and monitoring. The health endpoint is `/api/health`.

## Key assumptions

- Kilograms are canonical. A stated portion is converted at the visible demo assumption of 0.35 kg and requires confirmation.
- Straight-line Haversine distance is an estimate, not live road travel time.
- Safety is a manual operational decision. Missing storage/packaging or review blocks acceptance.
- Initial match weights (30/20/20/15/15) need stakeholder calibration.
- Estimated meals use 0.4 kg/meal and estimated CO₂e uses 2.5 kg/kg food; both are configurable and labelled estimates.
- English extraction is tested. Hindi/Kannada script detection exists, but multilingual extraction is not claimed as validated.

See `docs/ARCHITECTURE.md`, `docs/API.md`, and `docs/MODEL_REPORT.md` for diagrams and technical detail.
