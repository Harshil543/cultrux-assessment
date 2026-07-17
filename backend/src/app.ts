import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './common/middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import currencyRoutes from './modules/currency/currency.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import checkoutRoutes from './modules/checkout/checkout.routes';
import webhookRoutes from './modules/webhooks/webhook.routes';
import campaignRoutes from './modules/campaigns/campaign.routes';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));

  // Stripe webhook needs raw body for signature verification
  app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/auth', authRoutes);
  app.use('/currencies', currencyRoutes);
  app.use('/wallet', walletRoutes);
  app.use('/checkout', checkoutRoutes);
  app.use('/campaigns', campaignRoutes);

  app.use(errorHandler);

  return app;
}
