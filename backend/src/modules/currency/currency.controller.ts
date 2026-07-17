import { Request, Response, NextFunction } from 'express';
import { CurrencyService } from './currency.service';
import { sendSuccess } from '../../common/utils/response';

export class CurrencyController {
  constructor(private readonly currencyService = new CurrencyService()) {}

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.currencyService.list();
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
