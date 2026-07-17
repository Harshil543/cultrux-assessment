import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './common/middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import currencyRoutes from './modules/currency/currency.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import checkoutRoutes from './modules/checkout/checkout.routes';
import webhookRoutes from './modules/webhooks/webhook.routes';
import campaignRoutes from './modules/campaigns/campaign.routes';

export function createApp(): Express {
  const app = express();

  const allowedOrigins = new Set([
    env.appUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (no Origin) and configured frontend origins
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(cookieParser());

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
