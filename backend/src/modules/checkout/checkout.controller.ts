import { Request, Response, NextFunction } from 'express';
import { CheckoutService, createSessionSchema } from './checkout.service';
import { sendSuccess } from '../../common/utils/response';

export class CheckoutController {
  constructor(private readonly checkoutService = new CheckoutService()) {}

  createSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.checkoutService.createCheckoutSession(req.user!.userId, req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };
}

export { createSessionSchema };
