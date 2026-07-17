import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { CampaignStatus } from '../common/constants';

export interface CampaignAttributes {
  id: number;
  userId: number;
  title: string;
  fundAmountCredits: number;
  status: CampaignStatus;
  fundedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CampaignCreationAttributes = Optional<
  CampaignAttributes,
  'id' | 'status' | 'fundedAt' | 'createdAt' | 'updatedAt'
>;

export class Campaign
  extends Model<CampaignAttributes, CampaignCreationAttributes>
  implements CampaignAttributes
{
  declare id: number;
  declare userId: number;
  declare title: string;
  declare fundAmountCredits: number;
  declare status: CampaignStatus;
  declare fundedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initCampaignModel(sequelize: Sequelize): typeof Campaign {
  Campaign.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'user_id',
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      fundAmountCredits: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'fund_amount_credits',
      },
      status: {
        type: DataTypes.ENUM('draft', 'funded'),
        allowNull: false,
        defaultValue: 'draft',
      },
      fundedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'funded_at',
      },
    },
    {
      sequelize,
      tableName: 'campaigns',
      underscored: true,
    },
  );
  return Campaign;
}
