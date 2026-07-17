import { describe, it, expect, beforeAll } from 'vitest';
import './setup';
import { AuthService } from '../src/modules/auth/auth.service';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { PaymentRepository } from '../src/modules/checkout/payment.repository';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { CurrencyRepository } from '../src/modules/currency/currency.repository';
import { PAYMENT_STATUS } from '../src/common/constants';

describe('duplicate credit-purchase webhook', () => {
  const auth = new AuthService();
  const checkout = new CheckoutService();
  const payments = new PaymentRepository();
  const wallets = new WalletService();
  const currencies = new CurrencyRepository();

  let userId: number;
  let paymentId: number;
  let campaignCurrencyId: number;

  beforeAll(async () => {
    const email = `dup_${Date.now()}@test.com`;
    const signup = await auth.signup({ email, password: 'password123' });
    userId = signup.user.id;

    const currency = await currencies.findByCode('CAMPAIGN');
    expect(currency).toBeTruthy();
    campaignCurrencyId = currency!.id;

    const payment = await payments.create({
      userId,
      currencyId: campaignCurrencyId,
      creditsToGrant: 100,
      amountPaise: 30000,
      status: PAYMENT_STATUS.PENDING,
      stripeSessionId: `cs_test_dup_${Date.now()}`,
      completedAt: null,
    });
    paymentId = payment.id;
  });

  it('grants credits only once when the same Stripe event is processed twice', async () => {
    const eventId = `evt_dup_${Date.now()}`;

    const first = await checkout.grantForTest(paymentId, eventId);
    expect(first.granted).toBe(true);

    const second = await checkout.grantForTest(paymentId, eventId);
    expect(second.granted).toBe(false);
    expect(second.reason).toBe('duplicate_event');

    const balances = await wallets.getBalances(userId);
    const campaign = balances.find((b) => b.currencyId === campaignCurrencyId);
    expect(campaign?.balanceCredits).toBe(100);

    const ledger = await wallets.getLedger(userId, { currencyId: campaignCurrencyId });
    const purchases = ledger.items.filter((i) => i.entryType === 'PURCHASE');
    expect(purchases).toHaveLength(1);
    expect(purchases[0].deltaCredits).toBe(100);
  });
});
