import { Transaction } from 'sequelize';
import { Wallet } from '../../models/Wallet';
import { WalletBalance } from '../../models/WalletBalance';
import { LedgerEntry, LedgerEntryCreationAttributes } from '../../models/LedgerEntry';
import { Currency } from '../../models/Currency';

export class WalletRepository {
  async createForUser(userId: number, transaction?: Transaction): Promise<Wallet> {
    return Wallet.create({ userId }, { transaction });
  }

  async findByUserId(userId: number, transaction?: Transaction): Promise<Wallet | null> {
    return Wallet.findOne({ where: { userId }, transaction });
  }

  async createZeroBalances(
    walletId: number,
    currencyIds: number[],
    transaction?: Transaction,
  ): Promise<void> {
    await WalletBalance.bulkCreate(
      currencyIds.map((currencyId) => ({
        walletId,
        currencyId,
        balanceCredits: 0,
      })),
      { transaction },
    );
  }

  async findBalancesByWalletId(walletId: number): Promise<WalletBalance[]> {
    return WalletBalance.findAll({
      where: { walletId },
      include: [{ model: Currency, as: 'currency' }],
      order: [['currencyId', 'ASC']],
    });
  }

  async findBalanceForUpdate(
    walletId: number,
    currencyId: number,
    transaction: Transaction,
  ): Promise<WalletBalance | null> {
    return WalletBalance.findOne({
      where: { walletId, currencyId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
  }

  async updateBalance(
    balanceId: number,
    balanceCredits: number,
    transaction: Transaction,
  ): Promise<void> {
    await WalletBalance.update({ balanceCredits }, { where: { id: balanceId }, transaction });
  }

  async createLedgerEntry(
    data: LedgerEntryCreationAttributes,
    transaction: Transaction,
  ): Promise<LedgerEntry> {
    return LedgerEntry.create(data, { transaction });
  }

  async findLedger(
    walletId: number,
    options: { currencyId?: number; limit?: number; offset?: number },
  ): Promise<{ rows: LedgerEntry[]; count: number }> {
    const where: { walletId: number; currencyId?: number } = { walletId };
    if (options.currencyId) {
      where.currencyId = options.currencyId;
    }

    return LedgerEntry.findAndCountAll({
      where,
      include: [{ model: Currency, as: 'currency' }],
      order: [['createdAt', 'DESC']],
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    });
  }

  async sumLedgerForCurrency(
    walletId: number,
    currencyId: number,
    transaction?: Transaction,
  ): Promise<number> {
    const result = await LedgerEntry.findOne({
      attributes: [[LedgerEntry.sequelize!.fn('COALESCE', LedgerEntry.sequelize!.fn('SUM', LedgerEntry.sequelize!.col('delta_credits')), 0), 'total']],
      where: { walletId, currencyId },
      transaction,
      raw: true,
    });
    return Number((result as unknown as { total: number })?.total ?? 0);
  }

  async findLedgerByReference(
    referenceType: string,
    referenceId: string,
    entryType: string,
    transaction?: Transaction,
  ): Promise<LedgerEntry | null> {
    return LedgerEntry.findOne({
      where: { referenceType, referenceId, entryType },
      transaction,
    });
  }
}
