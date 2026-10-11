# Model, NLP, and Matching Methodology

## Honest status

- **Runtime forecast:** deterministic seasonal-naive fallback. Working and persisted.
- **GRU pipeline:** implemented in `ml/train_gru.py`, but TensorFlow training was **not executed for this delivery**. There is no claimed GRU MAE/RMSE or production artifact.
- **Dataset:** `data/synthetic_sales.csv` contains 2,190 deterministic, explicitly labelled synthetic rows generated with seed 42.
- **NLP:** English rule-assisted extraction is tested. No Hugging Face model is bundled or claimed as fine-tuned. Hindi/Kannada script detection exists; multilingual entities are not validated.
- **Matching:** hard constraints plus initial configurable weights. Weights are not scientifically validated.

## Surplus definition

Runtime forecast surplus is `max(0, expected prepared kg - expected demand kg)`. This estimates operational leftover quantity. It is not automatically safe donation quantity. A separate manual review captures handling, packaging, timing, and safe quantity.

## Forecast preprocessing

1. Parse and chronologically sort dates.
2. Impute missing prepared/sold values with medians.
3. Constrain sold quantity to prepared quantity.
4. Derive missing surplus where possible.
5. Robustly clip outliers.
6. Evaluate only on the final chronological holdout; never random-shuffle time-series rows.
7. Runtime intervals use observed weekday surplus variability and are not calibrated probabilistic guarantees.

The Python GRU uses 14-day sequences, category one-hot features, train-only `StandardScaler`, chronological 70/15/15 splits, GRU layers, Huber loss, early stopping, and an 80% absolute-validation-residual interval. It saves artifacts only after reporting both GRU and seasonal-naive metrics. Deployment remains manual.

## NLP extraction

Reliable regular expressions identify quantities, units, and 12-hour times. A food lexicon maps explicit foods to categories. Dietary/storage/packaging tags require matching text evidence. Fields contain:

- value or `null`
- confidence
- source (`explicit`, `inferred_category`, or `unknown`)
- evidence when present

A portion is converted using the visible demo assumption of 0.35 kg/portion and always produces a clarification. Ambiguous or missing time, quantity, category, storage, or packaging information is shown for human correction.

## Matching logic

Hard rejection conditions include:

- recipient not verified
- donation safety not reviewed or deadline passed
- food category not accepted
- no capacity, or insufficient capacity when partial claims are disabled
- incompatible storage or dietary requirement
- non-overlapping pickup window
- distance beyond the recipient limit

Only eligible recipients are ranked. Components are normalized to 0–1:

- category/diet compatibility: 30%
- available capacity: 20%
- pickup timing overlap: 20%
- distance within recipient radius: 15%
- keyword-set semantic relevance: 15%

The distance is Haversine straight-line distance using synthetic demo coordinates. It is not traffic-aware route time. Similarity cannot override a hard rejection.

## Executed test results

Command executed:

```bash
npx tsx --test tests/core.test.ts
```

Observed result: **9 passed, 0 failed**. Covered explicit and unknown NLP fields, NGO requirement extraction, chronological preprocessing, deterministic forecast/holdout, expiry/manual-safety blocks, category rejection, partial capacity, and eligible ranking.

Not claimed: production load/concurrency benchmark, multilingual precision/recall/F1, transformer classifier metrics, GRU metrics, external notification delivery, or live routing accuracy. A labelled NLP evaluation corpus and deployment-scale concurrent API test remain required before production.

## Controlled feedback and retraining

Actual surplus and completed donation quantities are stored separately from predictions. A candidate model should be retrained only after sufficient new observations, evaluated on a newer chronological holdout, compared against the deployed model and baseline, reviewed for category/business slices, then manually approved. Automatic model deployment is intentionally absent.
