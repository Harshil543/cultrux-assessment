# DESIGN.md

Design notes for the multi-currency credits wallet + campaign funding slice.
Correctness goal: credits are never lost, double-granted, over-spent, spent in the
wrong module, or granted without a real payment — and every balance traces to the ledger.

## Schema (ER)

```
users 1──1 wallets 1──* wallet_balances *──1 currencies 1──* currency_plans
                 │
                 └──* ledger_entries *──1 currencies

users 1──* payments *──1 currencies
users 1──* campaigns

stripe_webhook_events   (dedupe log, stripe_event_id UNIQUE)
```

- **wallets** — one per user (created at signup with zero balances for every active currency).
- **wallet_balances** — cached balance per `(wallet, currency)`.
- **ledger_entries** — append-only source of truth; balance always equals `SUM(delta_credits)`.
- **payments** — one row per checkout attempt; state machine below.
- **campaigns** — funded once, from Campaign Credits only.

### Three currencies & module binding

Currencies are **seeded data**, not hardcoded logic. Each is bound to one module:

| code | module | per_credit_paise |
|------|--------|------------------|
| CAMPAIGN | campaigns | 300 |
| REPORT | reports | 1000 |
| DISCOVERY | discovery | 500 |

Spend rules resolve the currency by module (e.g. campaign funding loads
`module = campaigns`) rather than trusting a client-supplied `currencyId`. Adding a
module = seed a row; no code change. Reports/Discovery spends can reuse the same pattern.

### Money & credits

- Prices in integer **paise** (₹1 = 100); balances/deltas in integer **credits**. No floats.

## Idempotency & transactions

Every money mutation is one `sequelize.transaction` with a row lock, so ledger insert +
balance update commit together (or not at all).

### Columns / constraints that enforce invariants

| Table | Constraint | Protects against |
|-------|------------|------------------|
| `stripe_webhook_events` | `UNIQUE(stripe_event_id)` | Duplicate webhook delivery |
| `ledger_entries` | `UNIQUE(reference_type, reference_id, currency_id, entry_type)` | Double PURCHASE/SPEND/REFUND/CHARGEBACK per reference |
| `payments` | `UNIQUE(stripe_session_id)`, `UNIQUE(stripe_payment_intent_id)` | Session/intent → one payment |
| `payments` | `UNIQUE(user_id, client_idempotency_key)` | Client retrying "Pay" (double-submit) |
| `wallet_balances` | `UNIQUE(wallet_id, currency_id)` | Duplicate balance rows |

Note: the DB-level `CHECK (balance_credits >= 0)` was **intentionally dropped** — a
refund/chargeback after the credits were already spent must still reverse the full
purchase in the ledger, so a balance may legitimately go negative. Ledger accuracy
(`balance == SUM(ledger)`) takes priority over a non-negative display value. Overspend on
the *spend* path is still prevented in-code (balance check under lock), so users cannot
drive their own balance negative.

### Transaction boundaries

- `CheckoutService.grantCreditsFromCheckoutSession` — webhook credit grant
- `CheckoutService.markCheckoutSessionTerminal` — failed / expired
- `CheckoutService.reverseCreditsForPayment` — refund / chargeback
- `CampaignService.fund` — campaign spend

### Payment state machine

`pending → completed` (paid) · `pending → failed | expired` · `completed → refunded | disputed`.
Transitions are guarded by current status, so out-of-order events can't corrupt state.

## Flow walkthroughs

### Buy credits

Client `POST /checkout/sessions` (optional `Idempotency-Key`) → Stripe Checkout →
Stripe webhook grants credits. **The browser success redirect never grants** — only a
verified webhook does.

| Failure point | How the design upholds it |
|---------------|---------------------------|
| Forged / unsigned webhook | `constructEvent` verifies the signature on the **raw body** before any DB access → 401 |
| Session not `paid` | Early return `session_not_paid`, no grant |
| Duplicate event | `UNIQUE(stripe_event_id)` insert fails → `duplicate_event` |
| Same payment, different event id | `payments.status == completed` + unique PURCHASE ledger ref → grant once |
| Late webhook after fail/expire | Allowed to still grant (settlement wins); late fail after completed is a no-op |
| Double-clicked "Pay" | `UNIQUE(user_id, client_idempotency_key)` reuses the same payment / open session |
| Refund / chargeback | REFUND / CHARGEBACK ledger entry reverses the purchase; payment → refunded/disputed |

### Fund campaign

Client `POST /campaigns/:id/fund`. Runs in one transaction:

1. Resolve Campaign Credits (`code=CAMPAIGN`, `module=campaigns`); reject any other `currencyId`.
2. Lock campaign row → reject if already funded.
3. Lock balance row (`SELECT … FOR UPDATE`).
4. Reject if `balance < fundAmount` — **before** any write, so balance/ledger stay untouched.
5. Insert `SPEND` ledger entry, decrement balance, mark funded.

| Failure point | How the design upholds it |
|---------------|---------------------------|
| Wrong-currency spend | Rejected before the transaction |
| Insufficient credits | 409 before any write |
| Already funded | Status check + unique SPEND reference |
| Concurrent funds | Row lock serializes them; the second sees the updated balance and fails |

## Acceptance mapping

- `balance == SUM(ledger)` per currency, updated atomically — verifiable via `GET /wallet/reconcile`.
- Credits granted exactly once, correct currency/qty, webhook-only.
- Campaign spends Campaign Credits only; funded at most once.
- Wallet/campaign routes behind auth (HTTP-only cookie; Bearer fallback for scripts/tests).

Tests: duplicate webhook, signed HTTP webhook (bad-sig rejected + grant/expire), checkout
idempotency, refund/chargeback + reconcile, insufficient/concurrent/wrong-currency funding.

## What I'd improve / didn't have time for

All required behaviour (webhook-only grants, idempotency, out-of-order safety, signature
verification, wrong-currency/insufficient/concurrent spend protection) is implemented and
tested. Remaining items are enhancements, not gaps in the assignment:

- **Scheduled reconciliation** — `/wallet/reconcile` runs on demand; no background job yet that
  periodically asserts `balance == SUM(ledger)` and alerts on drift.
- **E2E in CI** — tests are service-level + signed HTTP (supertest); no full Stripe-CLI run in CI.

Schema uses Sequelize **migrations only** (no `sequelize.sync()`).
