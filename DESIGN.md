# DESIGN.md

Short design notes for the multi-currency credits wallet and campaign funding slice.

## Schema (ER)

```
users 1──1 wallets 1──* wallet_balances *──1 currencies 1──* currency_plans
                 │
                 └──* ledger_entries *──1 currencies

users 1──* payments *──1 currencies
users 1──* campaigns

stripe_webhook_events (stripe_event_id UNIQUE)
```

### Currencies & module binding

`currencies` is seeded/configurable data (not hardcoded spend rules beyond “look up module”):

| code | module | per_credit_paise |
|------|--------|------------------|
| CAMPAIGN | campaigns | 300 |
| REPORT | reports | 1000 |
| DISCOVERY | discovery | 500 |

Campaign funding loads the currency bound to `module = campaigns` (or rejects an explicit non-campaign `currencyId`). Reports/Discovery spend can reuse the same pattern later.

### Money & credits

- Prices: integer **paise**
- Balances / ledger deltas: integer **credits**
- No floating-point money math

### Important constraints

| Table | Constraint | Why |
|-------|------------|-----|
| `wallet_balances` | `UNIQUE(wallet_id, currency_id)` | One balance row per currency |
| `wallet_balances` | `CHECK (balance_credits >= 0)` | DB-level non-negative |
| `ledger_entries` | `UNIQUE(reference_type, reference_id, currency_id, entry_type)` | One PURCHASE per payment; one SPEND per campaign |
| `payments` | `UNIQUE(stripe_session_id)` | Tie session → payment |
| `stripe_webhook_events` | `UNIQUE(stripe_event_id)` | Duplicate webhooks are no-ops |

Ledger is the audit trail; balances are updated **in the same transaction** as the ledger insert.

## Idempotency & transactions

### Buy credits (webhook grant)

**Boundary:** single DB transaction in `CheckoutService.grantCreditsFromCheckoutSession`.

1. Insert `stripe_webhook_events` — if unique violation → return `duplicate_event`, no grant  
2. Lock payment by `stripe_session_id` / metadata `paymentId`  
3. If already `completed` → no-op  
4. Lock `wallet_balances` (`SELECT … FOR UPDATE`)  
5. Insert ledger `PURCHASE` (`reference_type=payment`, `reference_id=payment.id`)  
6. Increment balance  
7. Mark payment `completed`

Forged webhooks are rejected in the controller via `stripe.webhooks.constructEvent` before any DB write.

Browser success URL only shows a message; it never grants credits.

### Fund campaign

**Boundary:** single transaction in `CampaignService.fund`.

1. Resolve Campaign Credits currency (`code=CAMPAIGN`, `module=campaigns`); reject wrong `currencyId`  
2. Lock campaign row for user — reject if already funded  
3. Lock campaign balance row  
4. Reject if `balance < fund_amount` (no writes)  
5. Insert ledger `SPEND` (`reference_type=campaign`)  
6. Decrement balance  
7. Set `status=funded`, `funded_at=now`

Concurrent fund requests serialize on the locked rows; the second sees insufficient credits or already-funded / unique ledger reference.

## Flow walkthroughs

### Buy credits — failure points

| Failure | Handling |
|---------|----------|
| Bad/missing signature | 401, no DB touch |
| Duplicate event id | Unique insert fails → no second grant |
| Late webhook after already completed | Detected via payment status / ledger unique |
| Session not `paid` | No grant |
| Stripe retries | Same event id → idempotent |

### Fund campaign — failure points

| Failure | Handling |
|---------|----------|
| Wrong currency | Validation before spend |
| Insufficient credits | 409, ledger/balance untouched |
| Already funded | Conflict / unique spend reference |
| Two parallel funds | Row locks + balance check → one wins |

## Acceptance mapping

- Balance equals ledger sum for that currency (updated atomically with each entry)  
- Grant once per payment, correct currency/qty, webhook-only  
- Campaign spends only Campaign Credits  
- Never negative; fund at most once  
- Wallet/campaign routes behind JWT  

## What I’d improve / didn’t prioritize

- Stripe Customer + receipt emails; chargeback/refund reversing ledger entries  
- Outbox / metrics for webhook processing failures  
- Redis locks only if we outgrow row-level MySQL locks  
- Stronger property tests that assert `SUM(ledger) = balance` after every mutation  
- Frontend polish and E2E against Stripe CLI in CI  

Schema uses Sequelize **migrations only** (no `sequelize.sync()`).
