import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface CurrencyPlanAttributes {
  id: number;
  currencyId: number;
  label: string;
  credits: number;
  totalPaise: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CurrencyPlanCreationAttributes = Optional<
  CurrencyPlanAttributes,
  'id' | 'createdAt' | 'updatedAt'
>;

export class CurrencyPlan
  extends Model<CurrencyPlanAttributes, CurrencyPlanCreationAttributes>
  implements CurrencyPlanAttributes
{
  declare id: number;
  declare currencyId: number;
  declare label: string;
  declare credits: number;
  declare totalPaise: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initCurrencyPlanModel(sequelize: Sequelize): typeof CurrencyPlan {
  CurrencyPlan.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      currencyId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'currency_id',
      },
      label: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      credits: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      totalPaise: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'total_paise',
      },
    },
    {
      sequelize,
      tableName: 'currency_plans',
      underscored: true,
    },
  );
  return CurrencyPlan;
}
