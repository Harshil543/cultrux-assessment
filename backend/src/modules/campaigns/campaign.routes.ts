import { Router } from 'express';
import { CampaignController, createCampaignSchema } from './campaign.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/middleware/validate';

const router = Router();
const controller = new CampaignController();

router.post('/', authMiddleware, validate(createCampaignSchema), controller.create);
router.get('/', authMiddleware, controller.list);
router.post('/:id/fund', authMiddleware, controller.fund);

export default router;
