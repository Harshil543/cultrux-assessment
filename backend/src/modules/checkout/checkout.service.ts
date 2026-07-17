import Stripe from 'stripe';
import { z } from 'zod';
import { env } from '../../config/env';
import { sequelize } from '../../models';
import { NotFoundError, ValidationError } from '../../common/errors/AppError';
import { LEDGER_ENTRY_TYPES, PAYMENT_STATUS } from '../../common/constants';
import { computeCustomQuantityPaise } from '../../common/utils/money';
import {
  getStripeClient,
  getStripePresentmentCurrency,
  mapStripeError,
} from '../../lib/stripe';
import { CurrencyRepository } from '../currency/currency.repository';
import { WalletRepository } from '../wallet/wallet.repository';
import { UserRepository } from '../auth/auth.repository';
import { PaymentRepository } from './payment.repository';

const createSessionSchema = z
  .object({
    currencyId: z.number().int().positive(),
    planId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().optional(),
  })
  .refine((d) => (d.planId != null) !== (d.quantity != null), {
    message: 'Provide exactly one of planId or quantity',
  });

/** Stripe INR minimum is typically 50 paise (₹0.50). */
const MIN_INR_PAISE = 50;

export class CheckoutService {
  private stripe: Stripe | null = null;

  constructor(
    private readonly payments = new PaymentRepository(),
    private readonly currencies = new CurrencyRepository(),
    private readonly wallets = new WalletRepository(),
    private readonly users = new UserRepository(),
  ) {}

  private getStripe(): Stripe {
    if (this.stripe) return this.stripe;
    return getStripeClient();
  }

  /** Exposed for tests that inject a mock Stripe client */
  setStripeClient(client: Stripe): void {
    this.stripe = client;
  }

  async createCheckoutSession(userId: number, input: unknown) {
    const body = createSessionSchema.parse(input);
    const currency = await this.currencies.findById(body.currencyId);
    if (!currency || !currency.isActive) {
      throw new NotFoundError('Currency not found');
    }

    let credits: number;
    let amountPaise: number;

    if (body.planId != null) {
      const plan = await this.currencies.findPlanById(body.planId);
      if (!plan || plan.currencyId !== currency.id) {
        throw new ValidationError('Plan does not belong to the selected currency');
      }
      credits = plan.credits;
      amountPaise = plan.totalPaise;
    } else {
      credits = body.quantity!;
      amountPaise = computeCustomQuantityPaise(currency.perCreditPaise, credits);
    }

    const presentment = getStripePresentmentCurrency();
    if (presentment === 'inr' && amountPaise < MIN_INR_PAISE) {
      throw new ValidationError(
        `Amount must be at least ${MIN_INR_PAISE} paise (₹0.50) for INR Checkout`,
      );
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const payment = await this.payments.create({
      userId,
      currencyId: currency.id,
      creditsToGrant: credits,
      amountPaise,
      status: PAYMENT_STATUS.PENDING,
      stripeSessionId: null,
      completedAt: null,
    });

    const stripe = this.getStripe();
    const metadata = {
      paymentId: String(payment.id),
      userId: String(userId),
      currencyId: String(currency.id),
      currencyCode: currency.code,
      credits: String(credits),
      amountPaise: String(amountPaise),
    };

    // Attach Stripe Customer so Checkout shows the app login email and locks it (not editable).
    const stripeCustomerId = await this.getOrCreateStripeCustomer(stripe, user);

    /**
     * India / INR notes:
     * - Do NOT force only `card` — Indian test accounts often need Dashboard-enabled
     *   methods (card / UPI). Omitting payment_method_types lets Stripe use account settings.
     * - Amounts are integer paise (₹1 = 100).
     * - UPI can complete asynchronously → webhook also handles async_payment_succeeded.
     */
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer: stripeCustomerId,
          // Let Stripe pick methods enabled for this account + currency (card, UPI, etc.)
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: presentment,
                unit_amount: amountPaise,
                product_data: {
                  name: `${credits} ${currency.name}`,
                  description: `Wallet top-up · ${currency.code} · ${amountPaise} paise`,
                },
              },
            },
          ],
          success_url: `${env.appUrl}/wallet?checkout=success&paymentId=${payment.id}`,
          cancel_url: `${env.appUrl}/wallet?checkout=cancel`,
          client_reference_id: String(payment.id),
          metadata,
          payment_intent_data: {
            metadata,
            description: `Cultrux credit purchase #${payment.id}`,
          },
          locale: 'en',
        },
        {
          // Safe retries of the same create request won't create duplicate sessions
          idempotencyKey: `checkout_payment_${payment.id}`,
        },
      );
    } catch (err) {
      throw mapStripeError(err);
    }

    await this.payments.updateStripeSessionId(payment.id, session.id);

    if (!session.url) {
      throw new ValidationError('Stripe did not return a checkout URL');
    }

    return {
      paymentId: payment.id,
      checkoutUrl: session.url,
      amountPaise,
      credits,
      currencyCode: currency.code,
      stripeCurrency: presentment,
    };
  }

  /**
   * Stripe only locks the Checkout email when you pass `customer` (Customer ID).
   * `customer_email` alone prefills but still lets the buyer edit it.
   */
  private async getOrCreateStripeCustomer(
    stripe: Stripe,
    user: { id: number; email: string; stripeCustomerId: string | null },
  ): Promise<string> {
    if (user.stripeCustomerId) {
      try {
        const existing = await stripe.customers.retrieve(user.stripeCustomerId);
        if (!('deleted' in existing && existing.deleted)) {
          return existing.id;
        }
      } catch {
        // Stored id missing in Stripe (e.g. switched test account) — recreate below
      }
    }

    const listed = await stripe.customers.list({ email: user.email, limit: 1 });
    const found = listed.data[0];
    if (found) {
      await this.users.updateStripeCustomerId(user.id, found.id);
      return found.id;
    }

    const created = await stripe.customers.create(
      {
        email: user.email,
        metadata: { userId: String(user.id) },
      },
      { idempotencyKey: `cultrux_user_${user.id}` },
    );
    await this.users.updateStripeCustomerId(user.id, created.id);
    return created.id;
  }

  /**
   * Grant credits after Stripe confirms payment (Checkout completed or async success).
   * Idempotent via UNIQUE(stripe_event_id) and payment status + ledger unique reference.
   */
  async grantCreditsFromCheckoutSession(params: {
    stripeEventId: string;
    eventType: string;
    stripeSessionId: string;
    paymentStatus: string;
    metadataPaymentId?: string;
  }): Promise<{ granted: boolean; reason?: string }> {
    if (params.paymentStatus !== 'paid') {
      return { granted: false, reason: 'session_not_paid' };
    }

    return sequelize.transaction(async (transaction) => {
      const inserted = await this.payments.tryInsertWebhookEvent(
        params.stripeEventId,
        params.eventType,
        transaction,
      );
      if (!inserted) {
        return { granted: false, reason: 'duplicate_event' };
      }

      let payment = await this.payments.findByStripeSessionId(
        params.stripeSessionId,
        transaction,
      );

      if (!payment && params.metadataPaymentId) {
        payment = await this.payments.findById(Number(params.metadataPaymentId), transaction);
      }

      if (!payment) {
        throw new NotFoundError('Payment not found for Stripe session');
      }

      if (payment.status === PAYMENT_STATUS.COMPLETED) {
        return { granted: false, reason: 'already_completed' };
      }

      const wallet = await this.wallets.findByUserId(payment.userId, transaction);
      if (!wallet) {
        throw new NotFoundError('Wallet not found');
      }

      const balance = await this.wallets.findBalanceForUpdate(
        wallet.id,
        payment.currencyId,
        transaction,
      );
      if (!balance) {
        throw new NotFoundError('Wallet balance row not found');
      }

      const existingLedger = await this.wallets.findLedgerByReference(
        'payment',
        String(payment.id),
        LEDGER_ENTRY_TYPES.PURCHASE,
        transaction,
      );
      if (existingLedger) {
        await this.payments.markCompleted(payment.id, transaction);
        return { granted: false, reason: 'ledger_already_exists' };
      }

      const newBalance = balance.balanceCredits + payment.creditsToGrant;
      await this.wallets.createLedgerEntry(
        {
          walletId: wallet.id,
          currencyId: payment.currencyId,
          deltaCredits: payment.creditsToGrant,
          entryType: LEDGER_ENTRY_TYPES.PURCHASE,
          referenceType: 'payment',
          referenceId: String(payment.id),
        },
        transaction,
      );
      await this.wallets.updateBalance(balance.id, newBalance, transaction);
      await this.payments.markCompleted(payment.id, transaction);

      return { granted: true };
    });
  }

  /** Test helper: grant without Stripe, still goes through ledger + balance TX */
  async grantForTest(paymentId: number, stripeEventId: string) {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    if (!payment.stripeSessionId) {
      await this.payments.updateStripeSessionId(paymentId, `test_session_${paymentId}`);
    }
    const refreshed = await this.payments.findById(paymentId);
    return this.grantCreditsFromCheckoutSession({
      stripeEventId,
      eventType: 'checkout.session.completed',
      stripeSessionId: refreshed!.stripeSessionId!,
      paymentStatus: 'paid',
      metadataPaymentId: String(paymentId),
    });
  }
}

export { createSessionSchema };
