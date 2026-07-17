import { z } from 'zod';
import { sequelize } from '../../models';
import {
  ConflictError,
  InsufficientCreditsError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/AppError';
import {
  CAMPAIGN_STATUS,
  CURRENCY_CODES,
  LEDGER_ENTRY_TYPES,
  MODULES,
} from '../../common/constants';
import { CampaignRepository } from './campaign.repository';
import { CurrencyRepository } from '../currency/currency.repository';
import { WalletRepository } from '../wallet/wallet.repository';

const createCampaignSchema = z.object({
  title: z.string().min(1).max(255),
  fundAmountCredits: z.number().int().positive(),
});

const fundCampaignSchema = z
  .object({
    currencyId: z.number().int().positive().optional(),
  })
  .optional();

export class CampaignService {
  constructor(
    private readonly campaigns = new CampaignRepository(),
    private readonly currencies = new CurrencyRepository(),
    private readonly wallets = new WalletRepository(),
  ) {}

  async create(userId: number, input: unknown) {
    const body = createCampaignSchema.parse(input);
    const campaign = await this.campaigns.create({
      userId,
      title: body.title.trim(),
      fundAmountCredits: body.fundAmountCredits,
      status: CAMPAIGN_STATUS.DRAFT,
      fundedAt: null,
    });
    return this.toDto(campaign);
  }

  async list(userId: number) {
    const rows = await this.campaigns.findByUserId(userId);
    return rows.map((c) => this.toDto(c));
  }

  /**
   * Fund a campaign using only Campaign Credits (module = campaigns).
   * Rejects wrong currency, insufficient balance, already-funded campaigns.
   * Concurrent funds are serialized via SELECT … FOR UPDATE on campaign + balance.
   */
  async fund(userId: number, campaignId: number, input?: unknown) {
    const body = fundCampaignSchema.parse(input ?? {});

    const campaignCurrency = await this.currencies.findByCode(CURRENCY_CODES.CAMPAIGN);
    if (!campaignCurrency || campaignCurrency.module !== MODULES.CAMPAIGNS) {
      throw new NotFoundError('Campaign currency is not configured');
    }

    if (body?.currencyId != null && body.currencyId !== campaignCurrency.id) {
      throw new ValidationError(
        'Campaigns can only be funded with Campaign Credits',
        { code: 'WRONG_CURRENCY_MODULE' },
      );
    }

    return sequelize.transaction(async (transaction) => {
      const campaign = await this.campaigns.findByIdForUser(campaignId, userId, transaction);
      if (!campaign) {
        throw new NotFoundError('Campaign not found');
      }

      if (campaign.status === CAMPAIGN_STATUS.FUNDED || campaign.fundedAt != null) {
        throw new ConflictError('Campaign is already funded', 'ALREADY_FUNDED');
      }

      const wallet = await this.wallets.findByUserId(userId, transaction);
      if (!wallet) {
        throw new NotFoundError('Wallet not found');
      }

      const balance = await this.wallets.findBalanceForUpdate(
        wallet.id,
        campaignCurrency.id,
        transaction,
      );
      if (!balance) {
        throw new NotFoundError('Campaign credit balance not found');
      }

      if (balance.balanceCredits < campaign.fundAmountCredits) {
        throw new InsufficientCreditsError(
          `Need ${campaign.fundAmountCredits} Campaign Credits, have ${balance.balanceCredits}`,
        );
      }

      const existingSpend = await this.wallets.findLedgerByReference(
        'campaign',
        String(campaign.id),
        LEDGER_ENTRY_TYPES.SPEND,
        transaction,
      );
      if (existingSpend) {
        throw new ConflictError('Campaign is already funded', 'ALREADY_FUNDED');
      }

      const newBalance = balance.balanceCredits - campaign.fundAmountCredits;

      await this.wallets.createLedgerEntry(
        {
          walletId: wallet.id,
          currencyId: campaignCurrency.id,
          deltaCredits: -campaign.fundAmountCredits,
          entryType: LEDGER_ENTRY_TYPES.SPEND,
          referenceType: 'campaign',
          referenceId: String(campaign.id),
        },
        transaction,
      );
      await this.wallets.updateBalance(balance.id, newBalance, transaction);
      await this.campaigns.markFunded(campaign.id, transaction);

      return {
        ...this.toDto(campaign),
        status: CAMPAIGN_STATUS.FUNDED,
        fundedAt: new Date(),
        remainingCampaignCredits: newBalance,
      };
    });
  }

  private toDto(campaign: {
    id: number;
    title: string;
    fundAmountCredits: number;
    status: string;
    fundedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: campaign.id,
      title: campaign.title,
      fundAmountCredits: campaign.fundAmountCredits,
      status: campaign.status,
      fundedAt: campaign.fundedAt,
      createdAt: campaign.createdAt,
    };
  }
}

export { createCampaignSchema, fundCampaignSchema };
