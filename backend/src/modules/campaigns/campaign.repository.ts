import { Transaction } from 'sequelize';
import { Campaign, CampaignCreationAttributes } from '../../models/Campaign';
import { CampaignStatus } from '../../common/constants';

export class CampaignRepository {
  async create(data: CampaignCreationAttributes, transaction?: Transaction): Promise<Campaign> {
    return Campaign.create(data, { transaction });
  }

  async findByUserId(userId: number): Promise<Campaign[]> {
    return Campaign.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
  }

  async findByIdForUser(
    id: number,
    userId: number,
    transaction?: Transaction,
  ): Promise<Campaign | null> {
    return Campaign.findOne({
      where: { id, userId },
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  }

  async markFunded(id: number, transaction: Transaction): Promise<void> {
    await Campaign.update(
      {
        status: 'funded' as CampaignStatus,
        fundedAt: new Date(),
      },
      { where: { id }, transaction },
    );
  }
}
