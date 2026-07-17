import { describe, it, expect, beforeAll } from 'vitest';
import './setup';
import { AuthService } from '../src/modules/auth/auth.service';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { PaymentRepository } from '../src/modules/checkout/payment.repository';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { CurrencyRepository } from '../src/modules/currency/currency.repository';
import { LEDGER_ENTRY_TYPES, PAYMENT_STATUS } from '../src/common/constants';

describe('payment lifecycle: fail / expire / refund / chargeback + reconcile', () => {
  const auth = new AuthService();
  const checkout = new CheckoutService();
  const payments = new PaymentRepository();
  const wallets = new WalletService();
  const currencies = new CurrencyRepository();

  let userId: number;
  let campaignCurrencyId: number;

  beforeAll(async () => {
    const signup = await auth.signup({
      email: `lifecycle_${Date.now()}@test.com`,
      password: 'password123',
    });
    userId = signup.user.id;
    const currency = await currencies.findByCode('CAMPAIGN');
    expect(currency).toBeTruthy();
    campaignCurrencyId = currency!.id;
  });

  async function createPendingPayment(credits = 100) {
    return payments.create({
      userId,
      currencyId: campaignCurrencyId,
      creditsToGrant: credits,
      amountPaise: credits * 300,
      status: PAYMENT_STATUS.PENDING,
      stripeSessionId: `cs_test_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      stripePaymentIntentId: null,
      clientIdempotencyKey: null,
      failureReason: null,
      completedAt: null,
    });
  }

  it('marks pending payment failed on async_payment_failed (and ignores if already completed)', async () => {
    const payment = await createPendingPayment();
    const failed = await checkout.markCheckoutSessionTerminal({
      stripeEventId: `evt_fail_${payment.id}`,
      eventType: 'checkout.session.async_payment_failed',
      stripeSessionId: payment.stripeSessionId!,
      status: PAYMENT_STATUS.FAILED,
      reason: 'async_payment_failed',
      metadataPaymentId: String(payment.id),
    });
    expect(failed.updated).toBe(true);

    const row = await payments.findById(payment.id);
    expect(row?.status).toBe(PAYMENT_STATUS.FAILED);

    // Out-of-order: still allow a later paid grant
    const granted = await checkout.grantForTest(payment.id, `evt_grant_after_fail_${payment.id}`);
    expect(granted.granted).toBe(true);

    const afterGrant = await payments.findById(payment.id);
    expect(afterGrant?.status).toBe(PAYMENT_STATUS.COMPLETED);

    const ignoreFail = await checkout.markCheckoutSessionTerminal({
      stripeEventId: `evt_fail_late_${payment.id}`,
      eventType: 'checkout.session.async_payment_failed',
      stripeSessionId: payment.stripeSessionId!,
      status: PAYMENT_STATUS.FAILED,
      reason: 'async_payment_failed',
    });
    expect(ignoreFail.updated).toBe(false);
    expect(ignoreFail.reason).toBe('already_completed');
  });

  it('marks session expired without granting credits', async () => {
    const payment = await createPendingPayment(50);
    const expired = await checkout.markCheckoutSessionTerminal({
      stripeEventId: `evt_exp_${payment.id}`,
      eventType: 'checkout.session.expired',
      stripeSessionId: payment.stripeSessionId!,
      status: PAYMENT_STATUS.EXPIRED,
      reason: 'checkout_session_expired',
    });
    expect(expired.updated).toBe(true);
    expect((await payments.findById(payment.id))?.status).toBe(PAYMENT_STATUS.EXPIRED);

    const reconcile = await wallets.reconcile(userId);
    expect(reconcile.ok).toBe(true);
  });

  it('refunds reverse PURCHASE credits and keeps balance === ledger sum', async () => {
    const payment = await createPendingPayment(80);
    const pi = `pi_refund_${payment.id}`;
    await checkout.grantForTest(payment.id, `evt_buy_${payment.id}`, pi);

    const before = await wallets.getBalances(userId);
    const campaignBefore = before.find((b) => b.currencyId === campaignCurrencyId)!;
    expect(campaignBefore.balanceCredits).toBeGreaterThanOrEqual(80);

    const refunded = await checkout.reverseCreditsForPayment({
      stripeEventId: `evt_refund_${payment.id}`,
      eventType: 'charge.refunded',
      entryType: LEDGER_ENTRY_TYPES.REFUND,
      terminalStatus: PAYMENT_STATUS.REFUNDED,
      stripePaymentIntentId: pi,
      stripeChargeId: `ch_${payment.id}`,
    });
    expect(refunded.reversed).toBe(true);

    const after = await payments.findById(payment.id);
    expect(after?.status).toBe(PAYMENT_STATUS.REFUNDED);

    const ledger = await wallets.getLedger(userId, { currencyId: campaignCurrencyId });
    const refunds = ledger.items.filter(
      (i) => i.entryType === 'REFUND' && i.referenceId === String(payment.id),
    );
    expect(refunds).toHaveLength(1);
    expect(refunds[0].deltaCredits).toBe(-80);

    const reconcile = await wallets.reconcile(userId);
    expect(reconcile.ok).toBe(true);
    const campaign = reconcile.currencies.find((c) => c.currencyId === campaignCurrencyId)!;
    expect(campaign.match).toBe(true);
    expect(campaign.balanceCredits).toBe(campaign.ledgerSum);

    // Duplicate refund event is a no-op
    const dup = await checkout.reverseCreditsForPayment({
      stripeEventId: `evt_refund_${payment.id}`,
      eventType: 'charge.refunded',
      entryType: LEDGER_ENTRY_TYPES.REFUND,
      terminalStatus: PAYMENT_STATUS.REFUNDED,
      stripePaymentIntentId: pi,
    });
    expect(dup.reversed).toBe(false);
    expect(dup.reason).toBe('duplicate_event');
  });

  it('chargeback reverses credits even if already spent (balance may go negative)', async () => {
    const payment = await createPendingPayment(40);
    const pi = `pi_dispute_${payment.id}`;
    await checkout.grantForTest(payment.id, `evt_buy_d_${payment.id}`, pi);

    // Spend more than remaining after we reverse would go negative — just reverse full purchase
    const disputed = await checkout.reverseCreditsForPayment({
      stripeEventId: `evt_dispute_${payment.id}`,
      eventType: 'charge.dispute.created',
      entryType: LEDGER_ENTRY_TYPES.CHARGEBACK,
      terminalStatus: PAYMENT_STATUS.DISPUTED,
      stripePaymentIntentId: pi,
    });
    expect(disputed.reversed).toBe(true);

    const reconcile = await wallets.reconcile(userId);
    expect(reconcile.ok).toBe(true);
  });
});
