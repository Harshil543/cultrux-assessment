import { describe, it, expect, beforeAll } from 'vitest';
import './setup';
import { AuthService } from '../src/modules/auth/auth.service';
import { CampaignService } from '../src/modules/campaigns/campaign.service';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { PaymentRepository } from '../src/modules/checkout/payment.repository';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { CurrencyRepository } from '../src/modules/currency/currency.repository';
import { PAYMENT_STATUS } from '../src/common/constants';
import { AppError } from '../src/common/errors/AppError';

describe('campaign funding overspend protection', () => {
  const auth = new AuthService();
  const campaigns = new CampaignService();
  const checkout = new CheckoutService();
  const payments = new PaymentRepository();
  const wallets = new WalletService();
  const currencies = new CurrencyRepository();

  let userId: number;
  let campaignCurrencyId: number;

  beforeAll(async () => {
    const email = `spend_${Date.now()}@test.com`;
    const signup = await auth.signup({ email, password: 'password123' });
    userId = signup.user.id;

    const currency = await currencies.findByCode('CAMPAIGN');
    campaignCurrencyId = currency!.id;

    // Grant exactly 100 campaign credits
    const payment = await payments.create({
      userId,
      currencyId: campaignCurrencyId,
      creditsToGrant: 100,
      amountPaise: 30000,
      status: PAYMENT_STATUS.PENDING,
      stripeSessionId: `cs_test_spend_${Date.now()}`,
      completedAt: null,
    });
    await checkout.grantForTest(payment.id, `evt_spend_${Date.now()}`);
  });

  it('rejects funding when balance is insufficient and leaves balance untouched', async () => {
    const before = await wallets.getBalances(userId);
    const beforeCredits = before.find((b) => b.currencyId === campaignCurrencyId)!.balanceCredits;
    expect(beforeCredits).toBe(100);

    const campaign = await campaigns.create(userId, {
      title: 'Too expensive',
      fundAmountCredits: 150,
    });

    await expect(campaigns.fund(userId, campaign.id)).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      statusCode: 409,
    });

    const after = await wallets.getBalances(userId);
    expect(after.find((b) => b.currencyId === campaignCurrencyId)!.balanceCredits).toBe(100);

    const list = await campaigns.list(userId);
    expect(list.find((c) => c.id === campaign.id)?.status).toBe('draft');
  });

  it('prevents concurrent funds from overspending the same balance', async () => {
    const c1 = await campaigns.create(userId, {
      title: 'Concurrent A',
      fundAmountCredits: 80,
    });
    const c2 = await campaigns.create(userId, {
      title: 'Concurrent B',
      fundAmountCredits: 80,
    });

    const results = await Promise.allSettled([
      campaigns.fund(userId, c1.id),
      campaigns.fund(userId, c2.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
    expect(err.code).toBe('INSUFFICIENT_CREDITS');

    const balances = await wallets.getBalances(userId);
    const remaining = balances.find((b) => b.currencyId === campaignCurrencyId)!.balanceCredits;
    expect(remaining).toBe(20);
    expect(remaining).toBeGreaterThanOrEqual(0);

    const list = await campaigns.list(userId);
    const funded = list.filter((c) => [c1.id, c2.id].includes(c.id) && c.status === 'funded');
    expect(funded).toHaveLength(1);
  });

  it('rejects funding with a non-campaign currency id', async () => {
    const report = await currencies.findByCode('REPORT');
    const campaign = await campaigns.create(userId, {
      title: 'Wrong currency',
      fundAmountCredits: 10,
    });

    await expect(
      campaigns.fund(userId, campaign.id, { currencyId: report!.id }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
