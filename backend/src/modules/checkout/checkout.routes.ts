import { Router } from 'express';
import { CheckoutController, createSessionSchema } from './checkout.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/middleware/validate';

const router = Router();
const controller = new CheckoutController();

router.post('/sessions', authMiddleware, validate(createSessionSchema), controller.createSession);

export default router;
