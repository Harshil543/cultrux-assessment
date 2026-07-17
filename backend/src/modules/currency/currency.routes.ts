import { Router } from 'express';
import { CurrencyController } from './currency.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';

const router = Router();
const controller = new CurrencyController();

router.get('/', authMiddleware, controller.list);

export default router;
