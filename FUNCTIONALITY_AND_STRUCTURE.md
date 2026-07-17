# Multi-Currency Credits Wallet & Campaign Funding

Functionality overview and recommended project structure for the take-home assignment.

---

## 1. Product Summary

| Concept | Description |
|--------|-------------|
| **Wallet** | Per-user balances for three internal credit currencies |
| **Ledger** | Append-only record of every credit in/out, per currency (source of truth for balance) |
| **Top-up** | User pays INR via Stripe Checkout → credits granted only on verified webhook |
| **Campaigns** | User creates campaigns; funding spends **Campaign Credits** only, once per campaign |

Real money enters only at Stripe purchase. Campaign funding is internal accounting.

---

## 2. Currencies (Seeded Data)

All amounts in **paise** (integer). Credits as **integers**.

| Code (example) | Module | Per-credit (paise) | Sample plans |
|----------------|--------|-------------------|--------------|
| `CAMPAIGN` | `campaigns` | 300 (₹3) | 100 → ₹300; 1,000 → ₹2,700 |
| `REPORT` | `reports` | 1,000 (₹10) | 10 → ₹100; 100 → ₹900 |
| `DISCOVERY` | `discovery` | 500 (₹5) | 100 → ₹500; 1,000 → ₹4,500 |

**Rule:** Each currency is bound to one module. Spending APIs must validate `currency.module === operation.module` (campaign fund → only `campaigns` + Campaign Credits).

---

## 3. Functional Requirements (Checklist)

### A. Authentication

- Signup: email + password (bcrypt/argon2 hash)
- Login: returns session/JWT
- All wallet, ledger, checkout, campaign routes require auth

### B. Wallet & Currencies

- Seed `currencies`, `currency_plans` (bundles), module binding
- On signup (or first login): create `wallet` + zero balances per currency (or lazy-create on first read)
- `ledger_entries`: type (`PURCHASE` \| `SPEND`), amount (+/-), `currency_id`, reference (payment id, campaign id), timestamps
- **Balance rule:** `wallet_balances.amount === SUM(ledger for that user+currency)` (or balance updated only inside same transaction as ledger insert)

**Reads**

- GET balances (all three currencies)
- GET ledger (filter by currency, paginate)

### C. Buy Credits (Stripe)

1. User picks currency + plan **or** custom quantity
2. Backend computes paise from plan or `quantity × per_credit_paise`
3. Create Checkout Session (metadata: `userId`, `currencyId`, `credits`, idempotency key / internal `payment_intent` record id)
4. Frontend redirects to Stripe
5. **Grant credits only** on `checkout.session.completed` (or equivalent) with signature verification
6. Idempotent grant: same Stripe event id → no second grant

**Do not** grant on success URL redirect alone.

### D. Campaigns

- Create campaign (name, target credits or fixed fund amount — define one model)
- List user’s campaigns
- Fund campaign:
  - Currency must be Campaign Credits only (reject body if wrong `currency_id`)
  - Sufficient balance
  - Campaign not already funded (`funded_at` / status)
  - Atomic: debit ledger + update balance + mark campaign funded

### E. Frontend (Minimal)

| Screen | Actions |
|--------|---------|
| Signup / Login | Forms, store token |
| Wallet | 3 balances, ledger table, Buy credits wizard → redirect Checkout |
| Campaigns | Create, list, Fund (Campaign Credits only) |

### F. Engineering

- Sequelize migrations only (no `sync()`)
- Transactions on grant + fund
- Tests: duplicate webhook; concurrent/over-spend prevention
- `DESIGN.md`, `README`, incremental Git commits

---

## 4. Failure Modes You Must Handle

| Scenario | Expected behavior |
|----------|-------------------|
| Duplicate webhook | Second processing no-op (unique constraint on Stripe event id or payment id) |
| Forged webhook | 401/400 before DB writes |
| Out-of-order webhooks | Payment record status machine; grant only when session paid |
| Insufficient credits | 409/400, no ledger row |
| Wrong currency for campaign | 400, no ledger row |
| Double fund same campaign | Unique constraint or `funded_at` check in transaction |
| Concurrent fund requests | Row lock / `SELECT … FOR UPDATE` on wallet balance row |

---

## 5. Recommended Repository Structure

```
cultrux-assessment/
├── README.md
├── DESIGN.md
├── FUNCTIONALITY_AND_STRUCTURE.md   # this file
├── docker-compose.yml                 # optional: MySQL + app
├── .env.example
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                   # HTTP server bootstrap
│   │   ├── config/                    # env, stripe, db
│   │   ├── db/
│   │   │   ├── sequelize.ts
│   │   │   └── migrations/
│   │   │   └── seeders/
│   │   ├── models/                    # User, Currency, Wallet, Ledger, Payment, Campaign, …
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.routes.ts
│   │   │   │   └── dto/
│   │   │   ├── wallet/
│   │   │   ├── checkout/
│   │   │   ├── webhooks/
│   │   │   │   └── stripe.webhook.controller.ts
│   │   │   └── campaigns/
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── error.middleware.ts
│   │   └── lib/
│   │       ├── money.ts               # paise helpers
│   │       └── idempotency.ts
│   └── tests/
│       ├── webhook-idempotency.test.ts
│       └── campaign-funding.test.ts
│
└── frontend/
    ├── package.json
    ├── src/
    │   ├── App.tsx
    │   ├── api/                       # fetch + auth header
    │   ├── pages/
    │   │   ├── Login.tsx
    │   │   ├── Signup.tsx
    │   │   ├── Wallet.tsx
    │   │   └── Campaigns.tsx
    │   └── components/
    └── vite.config.ts                 # or CRA / Next.js — assignment allows choice
```

Express or Fastify for REST is fine; NestJS is acceptable if the team stack prefers it — keep controller / service / repository separation either way.

---

## 6. Data Model (Logical)

### Core entities

```
users
  id, email (unique), password_hash, created_at

currencies
  id, code, name, module (enum/string), per_credit_paise, active

currency_plans
  id, currency_id, credits, total_paise, label

wallets
  id, user_id (unique)

wallet_balances
  id, wallet_id, currency_id, balance_credits
  UNIQUE (wallet_id, currency_id)

ledger_entries
  id, wallet_id, currency_id, delta_credits, entry_type, reference_type, reference_id, created_at

stripe_checkout_sessions / payments
  id, user_id, currency_id, credits_to_grant, amount_paise, stripe_session_id,
  stripe_payment_intent_id (optional), status (pending|completed|failed),
  created_at

stripe_webhook_events
  id, stripe_event_id (UNIQUE), event_type, processed_at, payload_hash (optional)

campaigns
  id, user_id, title, fund_amount_credits, status (draft|funded), funded_at, created_at
```

### ER (ASCII)

```
     ┌─────────┐       ┌─────────┐       ┌─────────────────┐
     │  users  │──1:1──│ wallets │──1:N──│ wallet_balances │
     └─────────┘       └────┬────┘       └────────┬────────┘
                            │                     │
                            │ 1:N                 │ N:1
                            ▼                     ▼
                     ┌──────────────┐      ┌─────────────┐
                     │ledger_entries│      │ currencies  │
                     └──────────────┘      └──────┬──────┘
                            ▲                     │ 1:N
                            │                     ▼
                     ┌──────┴───────┐      ┌──────────────┐
                     │   payments   │      │currency_plans│
                     └──────────────┘      └──────────────┘

     users ──1:N── campaigns
```

**Module binding:** `currencies.module` compared at spend time (e.g. fund campaign requires `module === 'campaigns'`).

---

## 7. REST API (Suggested)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/signup` | No | Register |
| POST | `/auth/login` | No | Login |
| GET | `/currencies` | Yes | List currencies + plans (for buy UI) |
| GET | `/wallet/balances` | Yes | Three balances |
| GET | `/wallet/ledger` | Yes | Query `?currencyId=` |
| POST | `/checkout/sessions` | Yes | Body: `currencyId`, `planId` **or** `quantity` → `{ url }` |
| POST | `/webhooks/stripe` | No (signature) | Raw body for Stripe |
| POST | `/campaigns` | Yes | Create |
| GET | `/campaigns` | Yes | List mine |
| POST | `/campaigns/:id/fund` | Yes | Spend campaign credits (no currency in body, or validate fixed currency id) |

---

## 8. Flow Walkthroughs

### Buy credits

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant Stripe
  participant DB

  UI->>API: POST /checkout/sessions
  API->>DB: Insert payment pending
  API->>Stripe: Create Checkout Session
  API-->>UI: checkout URL
  UI->>Stripe: User pays
  Stripe->>API: webhook checkout.session.completed
  API->>API: Verify signature
  API->>DB: BEGIN; insert webhook_event (unique); grant ledger + balance; commit
  Note over API,DB: Duplicate webhook hits unique on stripe_event_id → rollback grant path
```

**Failure points:** invalid signature (reject); duplicate event (idempotent); DB down (Stripe retries — must stay idempotent).

### Fund campaign

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant DB

  UI->>API: POST /campaigns/:id/fund
  API->>DB: BEGIN
  API->>DB: Lock campaign row; reject if funded
  API->>DB: Lock wallet_balance for CAMPAIGN currency
  API->>DB: If balance < amount ROLLBACK 409
  API->>DB: Insert ledger (-amount); decrement balance; set campaign funded
  API->>DB: COMMIT
```

**Failure points:** wrong currency module (reject before transaction); concurrent funds (second transaction sees `funded_at` or insufficient balance).

---

## 9. Idempotency & Transactions (Where They Live)

| Operation | Transaction boundary | Idempotency key / constraint |
|-----------|----------------------|------------------------------|
| Webhook grant | Single TX: record event → update payment → ledger + balance | `UNIQUE(stripe_event_id)` on `stripe_webhook_events` |
| Checkout create | Optional TX: create local payment row | Client idempotency-Key or reuse pending session rules |
| Fund campaign | Single TX: campaign + balance + ledger | `campaigns.funded_at IS NULL` + app check; optional `UNIQUE(campaign_id)` on spend ledger reference |

Balance updates should happen **only** in the same transaction as the ledger line that explains the change.

---

## 10. Tests (Minimum)

1. **Duplicate webhook:** POST same signed payload twice (or mock Stripe event id) → balance increases once, one PURCHASE ledger row (or two rows with second delta 0 if you model processed events separately — prefer one grant).
2. **Over-spend / concurrency:** Two parallel fund requests with balance enough for one → one succeeds, one fails; balance never negative.

Optional: wrong-currency fund rejected; ledger sum equals balance property test.

---

## 11. Configuration (Environment)

```env
DATABASE_URL=mysql://...
JWT_SECRET=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from stripe listen
APP_URL=http://localhost:5173
API_URL=http://localhost:3000
```

Local webhook: `stripe listen --forward-to localhost:3000/webhooks/stripe`

---

## 12. Git Commit Strategy (Suggested Order)

1. Repo scaffold + MySQL + Sequelize + first migration (users)
2. Auth signup/login + middleware
3. Currencies seed + wallet/ledger schema + read APIs
4. Stripe checkout session creation
5. Webhook verification + idempotent grant + tests
6. Campaigns CRUD + fund + concurrency + tests
7. Frontend flows
8. README + DESIGN.md polish

---

## 13. Out of Scope (Assignment)

- Reports / Discovery spending UIs (only top-up + campaign spend)
- Production Stripe Dashboard webhook endpoint (CLI is enough for local)
- Visual polish, admin panel, refunds/chargebacks (mention in DESIGN.md “future work” if needed)

---

## 14. Acceptance Criteria Quick Reference

- Ledger sums match per-currency balances
- Credits granted once per payment, correct currency/qty, webhook-only
- Campaign fund: Campaign Credits only; never negative; fund at most once
- Wallet/campaign APIs require login
- Holds under duplicate webhooks, retries, and concurrent fund requests
