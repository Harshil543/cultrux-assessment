import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import './setup';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { AuthService } from '../src/modules/auth/auth.service';
import { PaymentRepository } from '../src/modules/checkout/payment.repository';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { CurrencyRepository } from '../src/modules/currency/currency.repository';
import { PAYMENT_STATUS } from '../src/common/constants';

const WEBHOOK_SECRET = env.stripeWebhookSecret;

function signPayload(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
}

describe('HTTP signed Stripe webhooks', () => {
  const app = createApp();
  const auth = new AuthService();
  const payments = new PaymentRepository();
  const wallets = new WalletService();
  const currencies = new CurrencyRepository();

  let userId: number;
  let campaignCurrencyId: number;
  let paymentId: number;
  let sessionId: string;
  let accessToken: string;

  beforeAll(async () => {
    const signup = await auth.signup({
      email: `http_wh_${Date.now()}@test.com`,
      password: 'password123',
    });
    userId = signup.user.id;
    accessToken = signup.accessToken;

    const currency = await currencies.findByCode('CAMPAIGN');
    expect(currency).toBeTruthy();
    campaignCurrencyId = currency!.id;

    sessionId = `cs_http_${Date.now()}`;
    const payment = await payments.create({
      userId,
      currencyId: campaignCurrencyId,
      creditsToGrant: 100,
      amountPaise: 30000,
      status: PAYMENT_STATUS.PENDING,
      stripeSessionId: sessionId,
      stripePaymentIntentId: null,
      clientIdempotencyKey: null,
      failureReason: null,
      completedAt: null,
    });
    paymentId = payment.id;
  });

  it('rejects invalid signatures with 401 and does not grant credits', async () => {
    const payload = JSON.stringify({
      id: `evt_bad_sig_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: `pi_${paymentId}`,
          metadata: { paymentId: String(paymentId) },
        },
      },
    });

    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=deadbeef')
      .send(payload);

    expect(res.status).toBe(401);

    const balances = await wallets.getBalances(userId);
    const campaign = balances.find((b) => b.currencyId === campaignCurrencyId);
    expect(campaign?.balanceCredits ?? 0).toBe(0);
  });

  it('grants credits exactly once for the same signed checkout.session.completed payload', async () => {
    const eventId = `evt_http_grant_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: `pi_http_${paymentId}`,
          metadata: { paymentId: String(paymentId) },
        },
      },
    });
    const signature = signPayload(payload);

    const first = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.granted).toBe(true);

    const second = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.data.granted).toBe(false);
    expect(second.body.data.reason).toBe('duplicate_event');

    const balances = await wallets.getBalances(userId);
    const campaign = balances.find((b) => b.currencyId === campaignCurrencyId);
    expect(campaign?.balanceCredits).toBe(100);

    const reconcile = await request(app)
      .get('/wallet/reconcile')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(reconcile.status).toBe(200);
    expect(reconcile.body.data.ok).toBe(true);
  });

  it('marks expired sessions via signed checkout.session.expired', async () => {
    const session = `cs_exp_http_${Date.now()}`;
    const payment = await payments.create({
      userId,
      currencyId: campaignCurrencyId,
      creditsToGrant: 25,
      amountPaise: 7500,
      status: PAYMENT_STATUS.PENDING,
      stripeSessionId: session,
      stripePaymentIntentId: null,
      clientIdempotencyKey: null,
      failureReason: null,
      completedAt: null,
    });

    const payload = JSON.stringify({
      id: `evt_exp_http_${payment.id}`,
      object: 'event',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: session,
          object: 'checkout.session',
          payment_status: 'unpaid',
          metadata: { paymentId: String(payment.id) },
        },
      },
    });

    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signPayload(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(true);
    expect((await payments.findById(payment.id))?.status).toBe(PAYMENT_STATUS.EXPIRED);
  });
});
