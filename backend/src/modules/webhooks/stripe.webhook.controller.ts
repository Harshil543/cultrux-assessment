import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../common/errors/AppError';
import { LEDGER_ENTRY_TYPES, PAYMENT_STATUS } from '../../common/constants';
import { assertWebhookSecretConfigured, getStripeClient } from '../../lib/stripe';
import { CheckoutService } from '../checkout/checkout.service';
import { sendSuccess } from '../../common/utils/response';

const GRANT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

function paymentIntentIdFromSession(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}

function paymentIntentIdFromCharge(charge: Stripe.Charge): string | null {
  const pi = charge.payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}

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
          stripePaymentIntentId: paymentIntentIdFromSession(session),
        });
        console.log('[stripe.webhook]', event.type, event.id, result);
        sendSuccess(res, { received: true, ...result });
        return;
      }

      if (event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await this.checkoutService.markCheckoutSessionTerminal({
          stripeEventId: event.id,
          eventType: event.type,
          stripeSessionId: session.id,
          status: PAYMENT_STATUS.FAILED,
          reason: 'async_payment_failed',
          metadataPaymentId: session.metadata?.paymentId,
        });
        console.warn('[stripe.webhook] async payment failed', session.id, result);
        sendSuccess(res, { received: true, ...result });
        return;
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await this.checkoutService.markCheckoutSessionTerminal({
          stripeEventId: event.id,
          eventType: event.type,
          stripeSessionId: session.id,
          status: PAYMENT_STATUS.EXPIRED,
          reason: 'checkout_session_expired',
          metadataPaymentId: session.metadata?.paymentId,
        });
        console.log('[stripe.webhook] session expired', session.id, result);
        sendSuccess(res, { received: true, ...result });
        return;
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        const result = await this.checkoutService.reverseCreditsForPayment({
          stripeEventId: event.id,
          eventType: event.type,
          entryType: LEDGER_ENTRY_TYPES.REFUND,
          terminalStatus: PAYMENT_STATUS.REFUNDED,
          stripePaymentIntentId: paymentIntentIdFromCharge(charge),
          metadataPaymentId: charge.metadata?.paymentId,
          stripeChargeId: charge.id,
        });
        console.log('[stripe.webhook] charge.refunded', charge.id, result);
        sendSuccess(res, { received: true, ...result });
        return;
      }

      if (event.type === 'charge.dispute.created') {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
        let paymentIntentId: string | null = null;
        let metadataPaymentId: string | undefined;

        if (chargeId) {
          try {
            const charge = await stripe.charges.retrieve(chargeId);
            paymentIntentId = paymentIntentIdFromCharge(charge);
            metadataPaymentId = charge.metadata?.paymentId;
          } catch (err) {
            console.error('[stripe.webhook] failed to load charge for dispute', chargeId, err);
          }
        }

        const result = await this.checkoutService.reverseCreditsForPayment({
          stripeEventId: event.id,
          eventType: event.type,
          entryType: LEDGER_ENTRY_TYPES.CHARGEBACK,
          terminalStatus: PAYMENT_STATUS.DISPUTED,
          stripePaymentIntentId: paymentIntentId,
          metadataPaymentId,
          stripeChargeId: chargeId,
        });
        console.warn('[stripe.webhook] charge.dispute.created', dispute.id, result);
        sendSuccess(res, { received: true, ...result });
        return;
      }

      sendSuccess(res, { received: true, ignored: true, type: event.type });
    } catch (err) {
      next(err);
    }
  };
}
