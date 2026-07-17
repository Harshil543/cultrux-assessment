# Cultrux — Multi-Currency Credits Wallet & Campaign Funding

Working take-home: Node.js + TypeScript API, MySQL via Docker Compose, Sequelize migrations, Stripe Checkout (test mode), React UI.

## Architecture

```
Controller → Service → Repository
```

- **Repository** — database operations only
- **Service** — business logic, transactions, Stripe
- **Controller** — HTTP request/response
- **common/** — errors, middleware, auth utils, money helpers, constants

### Auth (HTTP-only cookie)

- Login/signup sets an **HTTP-only**, **SameSite**, access-token cookie (`cultrux_access_token`)
- Cookie is **Secure** in production (`NODE_ENV=production`); plain HTTP localhost uses `Secure=false` + `SameSite=Lax`
- Frontend uses `fetch(..., { credentials: 'include' })` — no JWT in `localStorage`
- `POST /auth/logout` clears the cookie
- Bearer token still accepted as a fallback for scripts/tests

## Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Stripe CLI (for local webhooks): https://docs.stripe.com/stripe-cli

## 1. Start MySQL (Docker only)

From the repo root:

```bash
docker-compose up -d
docker-compose ps   # wait until mysql is healthy / Up
```

This starts MySQL 8 on `localhost:3306` with:

| Setting  | Value        |
|----------|--------------|
| Database | `cultrux`    |
| User     | `cultrux`    |
| Password | `cultrux`    |
| Test DB  | `cultrux_test` (created by init script) |

## 2. Backend setup

```bash
cd backend
cp .env.example .env
# Edit STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (see Stripe section)

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

API: http://localhost:3000  
Health: `GET /health`

### Backend npm scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start API with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled `dist/` |
| `npm run db:migrate` | Run Sequelize migrations |
| `npm run db:migrate:undo` | Undo last migration |
| `npm run db:seed` | Seed currencies + plans |
| `npm run db:seed:undo` | Undo seeds |
| `npm run db:reset` | Undo all → migrate → seed |
| `npm test` | Run vitest (idempotency + overspend) |
| `npm run lint` | Typecheck |

## 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

UI: http://localhost:5173 (proxies API to `:3000`)

## 4. Stripe test setup (India / INR)

This app charges in **INR**. Amounts are integer **paise** (₹1 = 100 paise).

### Keys (two different secrets)

| Env var | What it is | Example prefix |
|---------|------------|----------------|
| `STRIPE_SECRET_KEY` | Dashboard → Developers → **API keys** → Secret key | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Printed by **Stripe CLI** `stripe listen` | `whsec_…` |

**Common mistake:** putting `sk_test_…` into `STRIPE_WEBHOOK_SECRET`. That breaks every webhook (invalid signature). Credits will never appear after pay.

### Steps

1. Create/use a Stripe account in **Test mode** (toggle in Dashboard).  
   For INR, registering with **country = India** is the smoothest path.
2. Copy **Secret key** (`sk_test_…`) → `backend/.env` → `STRIPE_SECRET_KEY`
3. Optional: Dashboard → **Settings → Payment methods** — enable **Cards** (and **UPI** if shown) for INR.
4. Install CLI: https://docs.stripe.com/stripe-cli then:

```bash
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
```

5. Copy the **webhook signing secret** (`whsec_…`) → `backend/.env` → `STRIPE_WEBHOOK_SECRET`
6. Restart the backend (`npm run dev`)
7. In the app: Buy credits → Stripe Checkout → test card:

| Field | Value |
|-------|--------|
| Card | `4242 4242 4242 4242` |
| Expiry | any future date |
| CVC | any 3 digits |
| OTP / 3DS | complete if prompted |

8. Keep `stripe listen` running while you pay. Credits are granted **only** after the webhook (`checkout.session.completed` or `async_payment_succeeded` for UPI).

Replay a duplicate webhook:

```bash
stripe events resend <evt_id>
```

### If you see: “only registered Indian businesses… can accept international payments”

Your Stripe account country is **India**. Card `4242 4242 4242 4242` is treated as an **international** card, and India accounts that are not a registered business cannot accept those (even in Test/Sandbox).

**Best options for this assignment (pick one):**

1. **Recommended — use a non-India Test account**  
   Create another Stripe account with country **United States** (or similar) → Test mode → new `sk_test_…`.  
   Keep `STRIPE_CURRENCY=inr` in `.env`. Checkout still shows ₹; India export rules won’t apply.  
   Update `STRIPE_SECRET_KEY`, restart backend, run `stripe listen` again for a new `whsec_…`.

2. **Stay on India account — pay with a domestic method**  
   Dashboard → **Settings → Payment methods** → enable **UPI** (and Indian cards if listed).  
   On Checkout, pay with **UPI** test flow instead of the Visa `4242…` card.  
   Keep `stripe listen` running so the webhook can grant credits.

3. **Not needed for the take-home**  
   Register as an Indian business / enable exports for live international cards — overkill for local testing.

Our app still grants credits **only via webhook** after Stripe marks the session paid.

## 5. Exercise the flows

1. Sign up / login  
2. Wallet → pick currency → plan or quantity → Stripe Checkout  
3. After webhook, refresh balances / ledger  
4. Campaigns → create → Fund (uses Campaign Credits only)

## 6. Tests

With Docker MySQL running:

```bash
cd backend
npm test
```

Covers:

- Duplicate purchase webhook → credits granted once  
- Insufficient / concurrent campaign funding → no overspend, never negative  

## API overview

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/signup` | No |
| POST | `/auth/login` | No |
| GET | `/auth/me` | Yes |
| GET | `/currencies` | Yes |
| GET | `/wallet/balances` | Yes |
| GET | `/wallet/ledger` | Yes |
| POST | `/checkout/sessions` | Yes |
| POST | `/webhooks/stripe` | Stripe signature |
| POST | `/campaigns` | Yes |
| GET | `/campaigns` | Yes |
| POST | `/campaigns/:id/fund` | Yes |

## Project layout

```
├── docker-compose.yml
├── docker/mysql/init.sql
├── DESIGN.md
├── backend/
│   ├── src/
│   │   ├── common/
│   │   ├── config/
│   │   ├── db/migrations|seeders
│   │   ├── models/
│   │   └── modules/   # auth, currency, wallet, checkout, webhooks, campaigns
│   └── tests/
└── frontend/
```

See **DESIGN.md** for schema, idempotency, and failure handling.
