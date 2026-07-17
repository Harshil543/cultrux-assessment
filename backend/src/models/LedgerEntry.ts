import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { LedgerEntryType } from '../common/constants';

export interface LedgerEntryAttributes {
  id: number;
  walletId: number;
  currencyId: number;
  deltaCredits: number;
  entryType: LedgerEntryType;
  referenceType: string;
  referenceId: string;
  createdAt?: Date;
}

export type LedgerEntryCreationAttributes = Optional<LedgerEntryAttributes, 'id' | 'createdAt'>;

export class LedgerEntry
  extends Model<LedgerEntryAttributes, LedgerEntryCreationAttributes>
  implements LedgerEntryAttributes
{
  declare id: number;
  declare walletId: number;
  declare currencyId: number;
  declare deltaCredits: number;
  declare entryType: LedgerEntryType;
  declare referenceType: string;
  declare referenceId: string;
  declare readonly createdAt: Date;
}

export function initLedgerEntryModel(sequelize: Sequelize): typeof LedgerEntry {
  LedgerEntry.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      walletId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'wallet_id',
      },
      currencyId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'currency_id',
      },
      deltaCredits: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'delta_credits',
      },
      entryType: {
        type: DataTypes.ENUM('PURCHASE', 'SPEND'),
        allowNull: false,
        field: 'entry_type',
      },
      referenceType: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'reference_type',
      },
      referenceId: {
        type: DataTypes.STRING(128),
        allowNull: false,
        field: 'reference_id',
      },
    },
    {
      sequelize,
      tableName: 'ledger_entries',
      underscored: true,
      updatedAt: false,
    },
  );
  return LedgerEntry;
}
