import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface WalletBalanceAttributes {
  id: number;
  walletId: number;
  currencyId: number;
  balanceCredits: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WalletBalanceCreationAttributes = Optional<
  WalletBalanceAttributes,
  'id' | 'balanceCredits' | 'createdAt' | 'updatedAt'
>;

export class WalletBalance
  extends Model<WalletBalanceAttributes, WalletBalanceCreationAttributes>
  implements WalletBalanceAttributes
{
  declare id: number;
  declare walletId: number;
  declare currencyId: number;
  declare balanceCredits: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initWalletBalanceModel(sequelize: Sequelize): typeof WalletBalance {
  WalletBalance.init(
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
      balanceCredits: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'balance_credits',
      },
    },
    {
      sequelize,
      tableName: 'wallet_balances',
      underscored: true,
    },
  );
  return WalletBalance;
}
