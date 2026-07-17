import { Request, Response, NextFunction } from 'express';
import { CampaignService, createCampaignSchema, fundCampaignSchema } from './campaign.service';
import { sendSuccess } from '../../common/utils/response';
import { z } from 'zod';

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export class CampaignController {
  constructor(private readonly campaignService = new CampaignService()) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.campaignService.create(req.user!.userId, req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.campaignService.list(req.user!.userId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  fund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = await this.campaignService.fund(req.user!.userId, id, req.body);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export { createCampaignSchema, fundCampaignSchema };
