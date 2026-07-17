import { Transaction } from 'sequelize';
import { Currency } from '../../models/Currency';
import { CurrencyPlan } from '../../models/CurrencyPlan';

export class CurrencyRepository {
  async findAllActive(transaction?: Transaction): Promise<Currency[]> {
    return Currency.findAll({
      where: { isActive: true },
      include: [{ model: CurrencyPlan, as: 'plans' }],
      order: [
        ['id', 'ASC'],
        [{ model: CurrencyPlan, as: 'plans' }, 'id', 'ASC'],
      ],
      transaction,
    });
  }

  async findById(id: number, transaction?: Transaction): Promise<Currency | null> {
    return Currency.findByPk(id, {
      include: [{ model: CurrencyPlan, as: 'plans' }],
      transaction,
    });
  }

  async findByCode(code: string, transaction?: Transaction): Promise<Currency | null> {
    return Currency.findOne({ where: { code }, transaction });
  }

  async findByModule(module: string, transaction?: Transaction): Promise<Currency | null> {
    return Currency.findOne({ where: { module, isActive: true }, transaction });
  }

  async findPlanById(planId: number, transaction?: Transaction): Promise<CurrencyPlan | null> {
    return CurrencyPlan.findByPk(planId, { transaction });
  }
}
