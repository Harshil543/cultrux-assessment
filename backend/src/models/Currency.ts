import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface CurrencyAttributes {
  id: number;
  code: string;
  name: string;
  module: string;
  perCreditPaise: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CurrencyCreationAttributes = Optional<
  CurrencyAttributes,
  'id' | 'isActive' | 'createdAt' | 'updatedAt'
>;

export class Currency
  extends Model<CurrencyAttributes, CurrencyCreationAttributes>
  implements CurrencyAttributes
{
  declare id: number;
  declare code: string;
  declare name: string;
  declare module: string;
  declare perCreditPaise: number;
  declare isActive: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initCurrencyModel(sequelize: Sequelize): typeof Currency {
  Currency.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      module: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      perCreditPaise: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'per_credit_paise',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active',
      },
    },
    {
      sequelize,
      tableName: 'currencies',
      underscored: true,
    },
  );
  return Currency;
}
