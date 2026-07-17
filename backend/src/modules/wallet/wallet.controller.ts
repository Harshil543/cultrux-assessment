import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { WalletService } from './wallet.service';
import { sendSuccess } from '../../common/utils/response';
import { validate } from '../../common/middleware/validate';

const ledgerQuerySchema = z.object({
  currencyId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export class WalletController {
  constructor(private readonly walletService = new WalletService()) {}

  balances = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.walletService.getBalances(req.user!.userId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  ledger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ledgerQuerySchema.parse(req.query);
      const data = await this.walletService.getLedger(req.user!.userId, query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export { ledgerQuerySchema };
