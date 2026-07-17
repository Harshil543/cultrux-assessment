import { NotFoundError } from '../../common/errors/AppError';
import { WalletRepository } from './wallet.repository';
import { Currency } from '../../models/Currency';

export class WalletService {
  constructor(private readonly wallets = new WalletRepository()) {}

  async getBalances(userId: number) {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundError('Wallet not found');
    }

    const balances = await this.wallets.findBalancesByWalletId(wallet.id);
    return balances.map((b) => {
      const currency = b.get('currency') as Currency | undefined;
      return {
        currencyId: b.currencyId,
        code: currency?.code,
        name: currency?.name,
        module: currency?.module,
        balanceCredits: b.balanceCredits,
      };
    });
  }

  async getLedger(
    userId: number,
    query: { currencyId?: number; limit?: number; offset?: number },
  ) {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundError('Wallet not found');
    }

    const { rows, count } = await this.wallets.findLedger(wallet.id, query);
    return {
      total: count,
      items: rows.map((e) => {
        const currency = e.get('currency') as Currency | undefined;
        return {
          id: e.id,
          currencyId: e.currencyId,
          currencyCode: currency?.code,
          deltaCredits: e.deltaCredits,
          entryType: e.entryType,
          referenceType: e.referenceType,
          referenceId: e.referenceId,
          createdAt: e.createdAt,
        };
      }),
    };
  }
}
