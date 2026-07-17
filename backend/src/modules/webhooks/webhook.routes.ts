import { Router } from 'express';
import { StripeWebhookController } from './stripe.webhook.controller';

const router = Router();
const controller = new StripeWebhookController();

// Raw body is attached in app.ts for this route only
router.post('/stripe', controller.handle);

export default router;
