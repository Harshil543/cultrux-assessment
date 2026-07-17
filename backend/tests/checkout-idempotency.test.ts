import { describe, it, expect, beforeAll, vi } from 'vitest';
import './setup';
import { AuthService } from '../src/modules/auth/auth.service';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { PaymentRepository } from '../src/modules/checkout/payment.repository';
import { CurrencyRepository } from '../src/modules/currency/currency.repository';
import { PAYMENT_STATUS } from '../src/common/constants';
import type Stripe from 'stripe';

describe('checkout client Idempotency-Key', () => {
  const auth = new AuthService();
  const checkout = new CheckoutService();
  const payments = new PaymentRepository();
  const currencies = new CurrencyRepository();

  let userId: number;
  let currencyId: number;
  let planId: number;

  beforeAll(async () => {
    const signup = await auth.signup({
      email: `idem_${Date.now()}@test.com`,
      password: 'password123',
    });
    userId = signup.user.id;
    const currency = await currencies.findByCode('CAMPAIGN');
    expect(currency).toBeTruthy();
    currencyId = currency!.id;
    const withPlans = await currencies.findById(currencyId);
    expect(withPlans).toBeTruthy();
    const plans = (withPlans!.get('plans') as { id: number }[]) || [];
    expect(plans.length).toBeGreaterThan(0);
    planId = plans[0].id;
  });

  it('reuses the same payment row when Idempotency-Key is repeated with the same payload', async () => {
    const key = `idem-key-${Date.now()}`;
    let createCount = 0;

    const mockStripe = {
      customers: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create: vi.fn().mockResolvedValue({ id: 'cus_test_idem' }),
        retrieve: vi.fn().mockResolvedValue({ id: 'cus_test_idem' }),
      },
      checkout: {
        sessions: {
          create: vi.fn().mockImplementation(async () => {
            createCount += 1;
            return {
              id: `cs_test_idem_${createCount}`,
              url: `https://checkout.stripe.test/pay/cs_test_idem_${createCount}`,
              status: 'open',
            };
          }),
          retrieve: vi.fn().mockImplementation(async (id: string) => ({
            id,
            status: 'open',
            url: `https://checkout.stripe.test/pay/${id}`,
          })),
        },
      },
    } as unknown as Stripe;

    checkout.setStripeClient(mockStripe);

    const first = await checkout.createCheckoutSession(
      userId,
      { currencyId, planId },
      key,
    );
    const second = await checkout.createCheckoutSession(
      userId,
      { currencyId, planId },
      key,
    );

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.reused).toBe(true);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);

    const row = await payments.findByUserIdempotencyKey(userId, key);
    expect(row?.id).toBe(first.paymentId);
    expect(row?.status).toBe(PAYMENT_STATUS.PENDING);

    // Only one Stripe session create — second call reused the open session
    expect(createCount).toBe(1);
  });

  it('rejects the same Idempotency-Key with a different payload', async () => {
    const key = `idem-conflict-${Date.now()}`;
    const mockStripe = {
      customers: {
        list: vi.fn().mockResolvedValue({ data: [{ id: 'cus_x' }] }),
        create: vi.fn(),
        retrieve: vi.fn().mockResolvedValue({ id: 'cus_x' }),
      },
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: 'cs_conflict',
            url: 'https://checkout.stripe.test/pay/cs_conflict',
            status: 'open',
          }),
          retrieve: vi.fn(),
        },
      },
    } as unknown as Stripe;

    checkout.setStripeClient(mockStripe);

    await checkout.createCheckoutSession(userId, { currencyId, planId }, key);

    await expect(
      checkout.createCheckoutSession(userId, { currencyId, quantity: 7 }, key),
    ).rejects.toThrow(/different checkout payload/i);
  });
});
