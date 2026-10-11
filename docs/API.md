# REST API

All request bodies are JSON unless noted. Protected routes use the HTTP-only `foodrescue_session` cookie. Errors use `{ "error": string, "details"?: unknown }`.

## Authentication

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Business/NGO account and profile |
| POST | `/api/auth/login` | Public | Verify password and set session |
| POST | `/api/auth/logout` | Session | Revoke current session |
| GET | `/api/auth/session` | Public | Current safe user or null |

Passwords need 8+ characters, uppercase, and a number. Public admin registration is unavailable.

## Intelligence and inputs

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/api/categories` | All | Active food categories |
| GET/POST | `/api/sales` | Business; admin read | Paginated history / reviewed row import (up to 500) |
| POST | `/api/predictions` | Business | Persist 1–7 day category fallback forecasts |
| POST | `/api/nlp/extract` | All | Donation or requirement extraction |

NLP request: `{ "mode": "donation" | "requirements", "text": string }`.

## Donations and matching

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET/POST | `/api/donations` | Scoped | List visible records / create reviewed donation |
| GET | `/api/donations/:id` | Scoped | Detail, own offers, authorized pickup plan |
| GET | `/api/donations/:id/matches` | Owner/admin | Server-ranked recipients |
| POST | `/api/donations/:id/offers` | Owner | Revalidate and alert selected NGOs |
| POST | `/api/donations/:id/accept` | Offered NGO | Full/partial row-locked reservation |
| POST | `/api/donations/:id/status` | Authorized | `START_PICKUP`, `COMPLETE`, or `CANCEL` |

Acceptance request: `{ "offerId": uuid, "quantityKg"?: number }`. The server never trusts a previously displayed capacity or score.

Completion requires an NGO or administrator and records the received quantity. A business cannot mark its own donation rescued.

## Profiles, alerts, analytics, administration

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET/PATCH | `/api/profile` | All | Account and organization settings |
| GET/PATCH | `/api/notifications` | All | Poll alerts / mark read |
| GET | `/api/analytics` | Scoped | Quantity outcomes and labelled estimates |
| GET/PATCH | `/api/admin/organizations` | Admin | Verify or suspend |
| GET | `/api/admin/audit` | Admin | Paginated audit records |
| GET | `/api/health` | Infrastructure | Database health |

## Authorization and reliability notes

- Business history, donations, match discovery, and lifecycle actions are owner-scoped.
- NGOs see their own offers and reservations.
- Administrator endpoints require the `ADMIN` role.
- Offer acceptance uses PostgreSQL row locks and a unique offer reservation.
- Offer sending recalculates every hard eligibility rule.
- In-app alerts expose a 15-second polling interval. External email/push adapters are optional.
- Production rate limiting should run at the ingress/API gateway; endpoint validation and session checks are already server-side.
