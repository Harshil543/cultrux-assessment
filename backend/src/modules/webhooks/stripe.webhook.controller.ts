import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../common/errors/AppError';
import { assertWebhookSecretConfigured, getStripeClient } from '../../lib/stripe';
import { CheckoutService } from '../checkout/checkout.service';
import { sendSuccess } from '../../common/utils/response';

const GRANT_EVENTS = new Set([
  'checkout.session.completed',
  // UPI / some Indian methods settle asynchronously
  'checkout.session.async_payment_succeeded',
]);

export class StripeWebhookController {
  constructor(private readonly checkoutService = new CheckoutService()) {}

  handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertWebhookSecretConfigured();

      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        throw new UnauthorizedError('Missing Stripe-Signature header');
      }

      const stripe = getStripeClient();
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          signature,
          env.stripeWebhookSecret,
        );
      } catch (err) {
        console.error('[stripe.webhook] signature verification failed', err);
        throw new UnauthorizedError(
          'Invalid Stripe webhook signature. Use the whsec_… secret printed by `stripe listen`, not sk_test_…',
        );
      }

      if (GRANT_EVENTS.has(event.type)) {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await this.checkoutService.grantCreditsFromCheckoutSession({
          stripeEventId: event.id,
          eventType: event.type,
          stripeSessionId: session.id,
          paymentStatus: session.payment_status,
          metadataPaymentId: session.metadata?.paymentId,
        });
        console.log('[stripe.webhook]', event.type, event.id, result);
        sendSuccess(res, { received: true, ...result });
        return;
      }

      if (event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session;
        console.warn('[stripe.webhook] async payment failed', session.id);
        sendSuccess(res, { received: true, ignored: true, type: event.type });
        return;
      }

      sendSuccess(res, { received: true, ignored: true, type: event.type });
    } catch (err) {
      next(err);
    }
  };
}
