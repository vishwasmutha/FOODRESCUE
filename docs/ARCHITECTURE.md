# Architecture

## Runtime components

```mermaid
flowchart LR
  U[Business / NGO / Admin] --> UI[Next.js React UI]
  UI --> API[App Router REST handlers]
  API --> AUTH[Session + RBAC]
  API --> NLP[Rule-assisted NLP]
  API --> MATCH[Eligibility + ranking]
  API --> FORECAST[Seasonal fallback]
  AUTH --> DB[(PostgreSQL)]
  MATCH --> DB
  FORECAST --> DB
  NLP --> DB
  PY[Offline Python GRU pipeline] --> ART[Validated artifacts + metadata]
  ART -. manual deployment only .-> FORECAST
  API --> POLL[In-app notification polling]
  API -. optional adapters .-> EXT[Email / FCM / maps / weather]
```

The application stores all timestamps in UTC. The UI displays India-oriented times (`Asia/Kolkata`). Secrets remain server-side.

## Core donation data flow

```mermaid
sequenceDiagram
  participant B as Business
  participant P as Platform
  participant DB as PostgreSQL
  participant N as NGO
  B->>P: Generate category forecast
  P->>DB: Read chronological history / persist prediction
  B->>P: Natural-language donation
  P-->>B: Extracted fields + clarifications
  B->>P: Correct, review safety, publish
  P->>DB: Donation + item + audit
  P->>DB: Filter eligible NGOs, rank candidates
  B->>P: Send selected offers
  P->>DB: Offers + notifications
  N->>P: Accept full/partial quantity
  P->>DB: Lock donation and NGO rows
  P->>DB: Validate remaining quantity/capacity
  P->>DB: Reservation + pickup + capacity decrement
  B->>P: Start pickup
  N->>P: Confirm received quantity
  P->>DB: Fulfill reservation and record rescued kg
  P-->>B: Analytics uses completed quantity only
```

## Entity relationship overview

```mermaid
erDiagram
  USERS ||--o| BUSINESSES : owns
  USERS ||--o| NGOS : owns
  USERS ||--o{ SESSIONS : has
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ AUDIT_LOGS : performs
  NGOS ||--o{ NGO_ACCEPTED_CATEGORIES : accepts
  FOOD_CATEGORIES ||--o{ NGO_ACCEPTED_CATEGORIES : selected
  NGOS ||--o{ NGO_OPERATING_HOURS : defines
  BUSINESSES ||--o{ SALES_HISTORY : records
  FOOD_CATEGORIES ||--o{ SALES_HISTORY : classifies
  MODEL_VERSIONS ||--o{ MODEL_EVALUATIONS : evaluated_by
  BUSINESSES ||--o{ SURPLUS_PREDICTIONS : receives
  MODEL_VERSIONS ||--o{ SURPLUS_PREDICTIONS : produces
  SURPLUS_PREDICTIONS ||--o| ACTUAL_SURPLUS : compared_to
  BUSINESSES ||--o{ DONATIONS : creates
  DONATIONS ||--o{ DONATION_ITEMS : contains
  FOOD_CATEGORIES ||--o{ DONATION_ITEMS : classifies
  DONATIONS ||--o{ DONATION_OFFERS : offered_as
  NGOS ||--o{ DONATION_OFFERS : receives
  DONATION_OFFERS ||--o{ OFFER_RESPONSES : answered_by
  DONATION_OFFERS ||--o| RESERVATIONS : reserves
  DONATIONS ||--o{ RESERVATIONS : allocates
  NGOS ||--o{ RESERVATIONS : claims
  RESERVATIONS ||--o| PICKUP_RECORDS : fulfilled_by
  DONATIONS ||--o{ USER_FEEDBACK : discussed_in
```

## State machine

```mermaid
stateDiagram-v2
  [*] --> PREDICTED
  PREDICTED --> DRAFT
  DRAFT --> AVAILABLE: review and publish
  AVAILABLE --> OFFERED
  OFFERED --> ACCEPTED: row-locked reservation
  ACCEPTED --> PICKUP_IN_PROGRESS
  PICKUP_IN_PROGRESS --> COMPLETED: full receipt
  PICKUP_IN_PROGRESS --> PARTIALLY_COMPLETED: partial receipt
  AVAILABLE --> EXPIRED
  OFFERED --> EXPIRED
  AVAILABLE --> CANCELLED
  OFFERED --> CANCELLED
  ACCEPTED --> FAILED_PICKUP
  DRAFT --> UNSAFE
```

## Transaction safety

Acceptance locks both donation and NGO rows (`SELECT … FOR UPDATE`), then validates offer state, expiry, donation deadline, safety review, remaining quantity, and current NGO capacity. A unique reservation per offer and database quantity checks provide a second line of defense. Cancellation releases active capacity in the same transaction.

## Extensibility

- Replace keyword semantic similarity with a versioned Sentence-Transformer adapter without changing hard filters.
- Deploy the validated Python artifact behind a model endpoint; retain fallback behavior for unavailable artifacts.
- Add a routing adapter while continuing to label Haversine distance separately.
- Add image classification only as category/packaging assistance, never as evidence that food is safe.
