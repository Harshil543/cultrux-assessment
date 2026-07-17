import Stripe from 'stripe';
import { env } from '../config/env';
import { ValidationError } from '../common/errors/AppError';

let stripeSingleton: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!env.stripeSecretKey || !env.stripeSecretKey.startsWith('sk_')) {
    throw new ValidationError(
      'STRIPE_SECRET_KEY is missing or invalid. Use the Test secret key (sk_test_…) from Stripe Dashboard → Developers → API keys.',
    );
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(env.stripeSecretKey, {
      // Pin API version only if your stripe package expects it; omit for SDK default
      typescript: true,
      appInfo: {
        name: 'Cultrux Credits Wallet',
        version: '1.0.0',
      },
    });
  }

  return stripeSingleton;
}

/** Presentment currency for Checkout (paise for INR). */
export function getStripePresentmentCurrency(): string {
  return (env.stripeCurrency || 'inr').toLowerCase();
}

export function assertWebhookSecretConfigured(): void {
  if (!env.stripeWebhookSecret || !env.stripeWebhookSecret.startsWith('whsec_')) {
    throw new ValidationError(
      'STRIPE_WEBHOOK_SECRET must be the signing secret from `stripe listen` (starts with whsec_…). Do not use sk_test_… here.',
    );
  }
}

export function mapStripeError(err: unknown): ValidationError {
  if (err instanceof Stripe.errors.StripeError) {
    const hint =
      err.code === 'amount_too_small'
        ? ' Amount is below Stripe minimum for this currency.'
        : err.message?.toLowerCase().includes('currency')
          ? ' Your Stripe account may not support INR yet — complete account country/currency setup in the Dashboard (Test mode), or enable card/UPI payment methods for INR.'
          : '';
    return new ValidationError(`Stripe error: ${err.message}.${hint}`, {
      type: err.type,
      code: err.code,
      statusCode: err.statusCode,
    });
  }
  throw err;
}
