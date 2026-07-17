import { Router } from 'express';
import { WalletController } from './wallet.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';

const router = Router();
const controller = new WalletController();

router.get('/balances', authMiddleware, controller.balances);
router.get('/ledger', authMiddleware, controller.ledger);

export default router;
