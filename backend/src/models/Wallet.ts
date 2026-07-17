import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface WalletAttributes {
  id: number;
  userId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WalletCreationAttributes = Optional<WalletAttributes, 'id' | 'createdAt' | 'updatedAt'>;

export class Wallet extends Model<WalletAttributes, WalletCreationAttributes> implements WalletAttributes {
  declare id: number;
  declare userId: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initWalletModel(sequelize: Sequelize): typeof Wallet {
  Wallet.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
        field: 'user_id',
      },
    },
    {
      sequelize,
      tableName: 'wallets',
      underscored: true,
    },
  );
  return Wallet;
}
