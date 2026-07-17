# Cultrux — Multi-Currency Credits Wallet & Campaign Funding

Take-home backend + React UI: multi-currency wallet, Stripe Checkout (test mode), webhook-driven credit grants, and campaign funding with Campaign Credits only.

Stack: **Node.js / TypeScript**, **MySQL 8** (Docker Compose), **Sequelize**, **Stripe**, **React + Vite**.

---

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node.js 20+** | Backend + frontend |
| **Docker + Docker Compose** | MySQL only |
| **Stripe account (Test mode)** | Dashboard API keys |
| **Stripe CLI** | Local webhooks — [install](https://docs.stripe.com/stripe-cli) |

---

## Quick start (full stack)

From the **repo root**:

```bash
# 1. MySQL
docker compose up -d
docker compose ps    # wait until mysql is healthy / Up

# 2. Backend
cd backend
cp .env.example .env
# → fill STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (see Stripe section below)
npm install
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3000

# 3. Stripe webhooks (separate terminal — keep running)
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
# → copy whsec_… into backend/.env → STRIPE_WEBHOOK_SECRET, then restart backend

# 4. Frontend (separate terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Root helpers (optional):

```bash
npm run db:up
npm run backend:install && npm run backend:migrate && npm run backend:seed
npm run backend:dev
npm run frontend:install && npm run frontend:dev
```

---

## 1. Install & configure

### Database (Docker)

```bash
docker compose up -d
```

| Setting | Value |
|---------|--------|
| Host / port | `127.0.0.1:3306` |
| Database | `cultrux` |
| User / password | `cultrux` / `cultrux` |
| Test DB | `cultrux_test` (created by `docker/mysql/init.sql`) |

Stop: `docker compose down`  
Logs: `docker compose logs -f mysql`

### Backend env

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

| Variable | Purpose | Example |
|----------|---------|---------|
| `DB_*` | MySQL connection | defaults match Docker Compose |
| `PORT` | API port | `3000` |
| `JWT_SECRET` | Signs the access cookie / JWT | long random string |
| `APP_URL` | Frontend origin (Checkout return URLs, CORS) | `http://localhost:5173` |
| `API_URL` | Public API base (optional) | `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | Stripe **secret** key (Test mode) | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from **`stripe listen`** | `whsec_…` |
| `STRIPE_CURRENCY` | Checkout presentment currency | `inr` (amounts in **paise**) |

**Never** put `sk_test_…` into `STRIPE_WEBHOOK_SECRET` — webhooks will fail signature checks and credits will never grant.

### Frontend

No `.env` required for local use. Vite proxies `/auth`, `/wallet`, `/checkout`, `/campaigns`, etc. to `http://localhost:3000`. Auth uses an **HTTP-only cookie** (`credentials: 'include'`).

---

## 2. Seed

Currencies (Campaign / Report / Discovery) and plans are loaded via Sequelize seeders:

```bash
cd backend
npm run db:migrate   # schema (required once / after pulls)
npm run db:seed      # currencies + plans
```

Reset DB schema + data:

```bash
npm run db:reset     # undo all → migrate → seed
```

| Script | Purpose |
|--------|---------|
| `npm run db:migrate` | Apply migrations |
| `npm run db:migrate:undo` | Undo last migration |
| `npm run db:seed` | Seed currencies + plans |
| `npm run db:seed:undo` | Undo seeds |
| `npm run db:reset` | Full reset |

---

## 3. Run backend

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

| URL | |
|-----|--|
| API | http://localhost:3000 |
| Health | `GET http://localhost:3000/health` |

Other scripts: `npm run build`, `npm start`, `npm test`, `npm run lint`.

---

## 4. Run frontend

```bash
cd frontend
npm install
npm run dev
```

UI: **http://localhost:5173**

---

## 5. Stripe test setup

Charges are in **INR**. Amounts are integer **paise** (`₹1 = 100`).

### Two different secrets

| Env var | Where it comes from | Prefix |
|---------|---------------------|--------|
| `STRIPE_SECRET_KEY` | Dashboard → Developers → **API keys** → Secret key | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Output of `stripe listen` | `whsec_…` |

Credits are granted **only** after a verified Stripe webhook (`checkout.session.completed` or `checkout.session.async_payment_succeeded`). The browser success redirect is **not** proof of payment.

### Steps

1. Open Stripe Dashboard in **Test mode**.
2. Copy **Secret key** → `backend/.env` → `STRIPE_SECRET_KEY`.
3. Optional: **Settings → Payment methods** — enable **Card** (and **UPI** if available for INR).
4. Install & login to Stripe CLI, then forward webhooks:

```bash
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe
```

5. Copy the printed **webhook signing secret** (`whsec_…`) → `backend/.env` → `STRIPE_WEBHOOK_SECRET`.
6. **Restart** the backend so it picks up the new secret.
7. Keep `stripe listen` running while you checkout.

### Test card

| Field | Value |
|-------|--------|
| Number | `4242 4242 4242 4242` |
| Expiry | Any future date |
| CVC | Any 3 digits |
| 3DS / OTP | Complete if prompted |

Replay a webhook (duplicate-delivery check):

```bash
stripe events resend <evt_id>
```

### India account + international cards

If Checkout says only registered Indian businesses can accept international payments, card `4242…` is treated as international. Options:

1. **Recommended:** create a non-India Test account (e.g. US), use its `sk_test_…`, keep `STRIPE_CURRENCY=inr`, re-run `stripe listen` for a new `whsec_…`.
2. Stay on an India account and pay with a **domestic** method (e.g. UPI test flow) with webhooks still forwarded.

---

## 6. Exercise the flows

With MySQL, backend, `stripe listen`, and frontend all running:

### A. Auth

1. Open http://localhost:5173  
2. **Sign up** (email + password ≥ 8) or **Login**  
3. Session is stored in an HTTP-only cookie (not `localStorage`)

### B. Buy credits (happy path)

1. **Wallet** → choose a currency (Campaign / Report / Discovery)  
2. Pick a **plan** or **custom quantity** → **Pay with Stripe**  
3. Complete Checkout with the test card  
4. Return to Wallet → click **Refresh** on the ledger  
5. Confirm balance increased and a `PURCHASE` ledger row appears  

If balances stay at `0`, check:

- `stripe listen` is running and forwarding to `:3000/webhooks/stripe`
- `STRIPE_WEBHOOK_SECRET` is the `whsec_…` from that listen session
- Backend was restarted after updating `.env`
- Stripe CLI log shows `checkout.session.completed` → `200`

### C. Duplicate webhook

```bash
stripe events resend <evt_id>
```

Balance must **not** increase again (same event / same payment → grant once).

### D. Campaign funding

1. Buy enough **Campaign Credits** first  
2. **Campaigns** → create with a fund amount  
3. **Fund** — spends Campaign Credits only  
4. Wrong currency / overspend / concurrent fund are rejected server-side (see tests)

### E. Reconcile (optional)

```bash
curl -s http://localhost:3000/wallet/reconcile -H "Authorization: Bearer <token>"
# or call while logged in via cookie from the browser
```

Expect `ok: true` and `balanceCredits === ledgerSum` per currency.

---

## 7. Tests

```bash
cd backend
npm test
```

Requires Docker MySQL (`cultrux_test`). Covers:

- Duplicate purchase webhook → credits once  
- Signed HTTP webhooks (bad signature rejected; grant + expire)  
- Checkout `Idempotency-Key` reuse  
- Refund / chargeback ledger reverse + reconcile  
- Insufficient / concurrent / wrong-currency campaign funding  

---

## API overview

Auth is cookie-based in the browser; **Bearer** still works for scripts/tests.

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/signup` | No |
| POST | `/auth/login` | No |
| POST | `/auth/logout` | Yes |
| GET | `/auth/me` | Yes |
| GET | `/currencies` | Yes |
| GET | `/wallet/balances` | Yes |
| GET | `/wallet/ledger` | Yes |
| GET | `/wallet/reconcile` | Yes |
| POST | `/checkout/sessions` | Yes (`Idempotency-Key` recommended) |
| POST | `/webhooks/stripe` | Stripe signature |
| POST | `/campaigns` | Yes |
| GET | `/campaigns` | Yes |
| POST | `/campaigns/:id/fund` | Yes |

Architecture: **Controller → Service → Repository**. See **DESIGN.md** for schema, idempotency, and failure handling.

---

## Project layout

```
├── docker-compose.yml
├── docker/mysql/init.sql
├── DESIGN.md
├── README.md
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
