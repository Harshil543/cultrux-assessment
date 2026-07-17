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
import { Payment } from '../../models/Payment';

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

type Quote = {
  currencyId: number;
  currencyCode: string;
  currencyName: string;
  credits: number;
  amountPaise: number;
};

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

  async createCheckoutSession(
    userId: number,
    input: unknown,
    clientIdempotencyKey?: string | null,
  ) {
    const body = createSessionSchema.parse(input);
    const quote = await this.buildQuote(body);
    const presentment = getStripePresentmentCurrency();
    if (presentment === 'inr' && quote.amountPaise < MIN_INR_PAISE) {
      throw new ValidationError(
        `Amount must be at least ${MIN_INR_PAISE} paise (₹0.50) for INR Checkout`,
      );
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const key = clientIdempotencyKey?.trim() || null;
    if (key && key.length > 128) {
      throw new ValidationError('Idempotency-Key must be at most 128 characters');
    }

    let payment: Payment | null = key
      ? await this.payments.findByUserIdempotencyKey(userId, key)
      : null;
    let reused = false;

    if (payment) {
      if (
        payment.currencyId !== quote.currencyId ||
        payment.creditsToGrant !== quote.credits ||
        payment.amountPaise !== quote.amountPaise
      ) {
        throw new ValidationError(
          'Idempotency-Key was reused with a different checkout payload',
        );
      }

      if (payment.status === PAYMENT_STATUS.COMPLETED) {
        throw new ValidationError('Payment already completed for this Idempotency-Key');
      }

      if (
        payment.status === PAYMENT_STATUS.REFUNDED ||
        payment.status === PAYMENT_STATUS.DISPUTED
      ) {
        throw new ValidationError('Payment was reversed for this Idempotency-Key');
      }

      if (payment.status === PAYMENT_STATUS.PENDING && payment.stripeSessionId) {
        const openUrl = await this.tryReuseOpenSession(payment.stripeSessionId);
        if (openUrl) {
          return {
            paymentId: payment.id,
            checkoutUrl: openUrl,
            amountPaise: quote.amountPaise,
            credits: quote.credits,
            currencyCode: quote.currencyCode,
            stripeCurrency: presentment,
            reused: true,
          };
        }
      }

      // Reuse the same payment row (pending / failed / expired) with a fresh Stripe session
      await sequelize.transaction(async (transaction) => {
        await this.payments.markStatus(payment!.id, PAYMENT_STATUS.PENDING, null, transaction);
      });
      payment = (await this.payments.findById(payment.id))!;
      reused = true;
    } else {
      payment = await this.payments.create({
        userId,
        currencyId: quote.currencyId,
        creditsToGrant: quote.credits,
        amountPaise: quote.amountPaise,
        status: PAYMENT_STATUS.PENDING,
        stripeSessionId: null,
        stripePaymentIntentId: null,
        clientIdempotencyKey: key,
        failureReason: null,
        completedAt: null,
      });
    }

    const stripe = this.getStripe();
    const metadata = {
      paymentId: String(payment.id),
      userId: String(userId),
      currencyId: String(quote.currencyId),
      currencyCode: quote.currencyCode,
      credits: String(quote.credits),
      amountPaise: String(quote.amountPaise),
    };

    const stripeCustomerId = await this.getOrCreateStripeCustomer(stripe, user);

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer: stripeCustomerId,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: presentment,
                unit_amount: quote.amountPaise,
                product_data: {
                  name: `${quote.credits} ${quote.currencyName}`,
                  description: `Wallet top-up · ${quote.currencyCode} · ${quote.amountPaise} paise`,
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
          // Stable key for first create; remints need a new Stripe idempotency key
          idempotencyKey: payment.stripeSessionId
            ? `checkout_payment_${payment.id}_remint_${Date.now()}`
            : key
              ? `checkout_user_${userId}_${key}`
              : `checkout_payment_${payment.id}`,
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
      amountPaise: quote.amountPaise,
      credits: quote.credits,
      currencyCode: quote.currencyCode,
      stripeCurrency: presentment,
      reused,
    };
  }

  private async buildQuote(body: z.infer<typeof createSessionSchema>): Promise<Quote> {
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

    return {
      currencyId: currency.id,
      currencyCode: currency.code,
      currencyName: currency.name,
      credits,
      amountPaise,
    };
  }

  private async tryReuseOpenSession(stripeSessionId: string): Promise<string | null> {
    try {
      const session = await this.getStripe().checkout.sessions.retrieve(stripeSessionId);
      if (session.status === 'open' && session.url) {
        return session.url;
      }
    } catch {
      // Session missing or Stripe unreachable — caller creates a new session
    }
    return null;
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
    stripePaymentIntentId?: string | null;
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

      if (
        payment.status === PAYMENT_STATUS.REFUNDED ||
        payment.status === PAYMENT_STATUS.DISPUTED
      ) {
        return { granted: false, reason: 'payment_already_reversed' };
      }

      // Out-of-order: expired/failed first, then paid — still allow grant
      if (
        payment.status !== PAYMENT_STATUS.PENDING &&
        payment.status !== PAYMENT_STATUS.FAILED &&
        payment.status !== PAYMENT_STATUS.EXPIRED
      ) {
        return { granted: false, reason: `unexpected_status_${payment.status}` };
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

      if (params.stripePaymentIntentId) {
        await this.payments.updateStripePaymentIntentId(
          payment.id,
          params.stripePaymentIntentId,
          transaction,
        );
      }

      return { granted: true };
    });
  }

  /**
   * Mark a pending payment failed/expired when Stripe reports async failure or session expiry.
   * No-ops if payment already completed/reversed (out-of-order safety).
   */
  async markCheckoutSessionTerminal(params: {
    stripeEventId: string;
    eventType: string;
    stripeSessionId: string;
    status: typeof PAYMENT_STATUS.FAILED | typeof PAYMENT_STATUS.EXPIRED;
    reason: string;
    metadataPaymentId?: string;
  }): Promise<{ updated: boolean; reason?: string }> {
    return sequelize.transaction(async (transaction) => {
      const inserted = await this.payments.tryInsertWebhookEvent(
        params.stripeEventId,
        params.eventType,
        transaction,
      );
      if (!inserted) {
        return { updated: false, reason: 'duplicate_event' };
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
        return { updated: false, reason: 'already_completed' };
      }
      if (
        payment.status === PAYMENT_STATUS.REFUNDED ||
        payment.status === PAYMENT_STATUS.DISPUTED
      ) {
        return { updated: false, reason: 'already_reversed' };
      }
      if (payment.status === params.status) {
        return { updated: false, reason: 'already_terminal' };
      }

      await this.payments.markStatus(payment.id, params.status, params.reason, transaction);
      return { updated: true };
    });
  }

  /**
   * Reverse a completed purchase after refund or chargeback.
   * Writes REFUND/CHARGEBACK ledger entry and updates balance (may go negative if spent).
   */
  async reverseCreditsForPayment(params: {
    stripeEventId: string;
    eventType: string;
    entryType: typeof LEDGER_ENTRY_TYPES.REFUND | typeof LEDGER_ENTRY_TYPES.CHARGEBACK;
    terminalStatus: typeof PAYMENT_STATUS.REFUNDED | typeof PAYMENT_STATUS.DISPUTED;
    stripePaymentIntentId?: string | null;
    metadataPaymentId?: string;
    stripeChargeId?: string;
  }): Promise<{ reversed: boolean; reason?: string }> {
    return sequelize.transaction(async (transaction) => {
      const inserted = await this.payments.tryInsertWebhookEvent(
        params.stripeEventId,
        params.eventType,
        transaction,
      );
      if (!inserted) {
        return { reversed: false, reason: 'duplicate_event' };
      }

      let payment: Payment | null = null;
      if (params.stripePaymentIntentId) {
        payment = await this.payments.findByStripePaymentIntentId(
          params.stripePaymentIntentId,
          transaction,
        );
      }
      if (!payment && params.metadataPaymentId) {
        payment = await this.payments.findById(Number(params.metadataPaymentId), transaction);
      }
      if (!payment) {
        throw new NotFoundError('Payment not found for Stripe refund/dispute');
      }

      if (payment.status === params.terminalStatus) {
        return { reversed: false, reason: 'already_reversed' };
      }

      if (payment.status === PAYMENT_STATUS.REFUNDED && params.terminalStatus === PAYMENT_STATUS.DISPUTED) {
        // Already fully refunded — dispute is informational only
        await this.payments.markStatus(
          payment.id,
          PAYMENT_STATUS.DISPUTED,
          'dispute_after_refund',
          transaction,
        );
        return { reversed: false, reason: 'already_refunded' };
      }

      if (payment.status !== PAYMENT_STATUS.COMPLETED && payment.status !== PAYMENT_STATUS.DISPUTED) {
        // Dispute on unpaid session — just mark
        if (payment.status === PAYMENT_STATUS.PENDING || payment.status === PAYMENT_STATUS.FAILED) {
          await this.payments.markStatus(
            payment.id,
            params.terminalStatus,
            params.entryType.toLowerCase(),
            transaction,
          );
          return { reversed: false, reason: 'not_completed_no_credits' };
        }
      }

      const purchase = await this.wallets.findLedgerByReference(
        'payment',
        String(payment.id),
        LEDGER_ENTRY_TYPES.PURCHASE,
        transaction,
      );
      if (!purchase) {
        await this.payments.markStatus(
          payment.id,
          params.terminalStatus,
          'no_purchase_ledger',
          transaction,
        );
        return { reversed: false, reason: 'no_purchase_ledger' };
      }

      const existingReverse = await this.wallets.findLedgerByReference(
        'payment',
        String(payment.id),
        params.entryType,
        transaction,
      );
      if (existingReverse) {
        await this.payments.markStatus(payment.id, params.terminalStatus, null, transaction);
        return { reversed: false, reason: 'ledger_already_reversed' };
      }

      // Prefer REFUND over stacking CHARGEBACK if refund already applied
      const existingRefund = await this.wallets.findLedgerByReference(
        'payment',
        String(payment.id),
        LEDGER_ENTRY_TYPES.REFUND,
        transaction,
      );
      if (existingRefund && params.entryType === LEDGER_ENTRY_TYPES.CHARGEBACK) {
        await this.payments.markStatus(
          payment.id,
          PAYMENT_STATUS.DISPUTED,
          'dispute_after_refund',
          transaction,
        );
        return { reversed: false, reason: 'already_refunded' };
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

      const delta = -payment.creditsToGrant;
      const newBalance = balance.balanceCredits + delta;

      await this.wallets.createLedgerEntry(
        {
          walletId: wallet.id,
          currencyId: payment.currencyId,
          deltaCredits: delta,
          entryType: params.entryType,
          referenceType: 'payment',
          referenceId: String(payment.id),
        },
        transaction,
      );
      await this.wallets.updateBalance(balance.id, newBalance, transaction);
      await this.payments.markStatus(
        payment.id,
        params.terminalStatus,
        params.stripeChargeId ? `charge:${params.stripeChargeId}` : null,
        transaction,
      );

      return { reversed: true };
    });
  }

  /** Test helper: grant without Stripe, still goes through ledger + balance TX */
  async grantForTest(
    paymentId: number,
    stripeEventId: string,
    stripePaymentIntentId?: string,
  ) {
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
      stripePaymentIntentId: stripePaymentIntentId ?? `pi_test_${paymentId}`,
    });
  }
}

export { createSessionSchema };
