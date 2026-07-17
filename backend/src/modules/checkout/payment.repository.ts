import { Transaction } from 'sequelize';
import { Payment, PaymentCreationAttributes } from '../../models/Payment';
import { StripeWebhookEvent } from '../../models/StripeWebhookEvent';
import { PaymentStatus } from '../../common/constants';

export class PaymentRepository {
  async create(data: PaymentCreationAttributes, transaction?: Transaction): Promise<Payment> {
    return Payment.create(data, { transaction });
  }

  async updateStripeSessionId(
    paymentId: number,
    stripeSessionId: string,
    transaction?: Transaction,
  ): Promise<void> {
    await Payment.update({ stripeSessionId }, { where: { id: paymentId }, transaction });
  }

  async findById(id: number, transaction?: Transaction): Promise<Payment | null> {
    return Payment.findByPk(id, {
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  }

  async findByStripeSessionId(
    stripeSessionId: string,
    transaction?: Transaction,
  ): Promise<Payment | null> {
    return Payment.findOne({
      where: { stripeSessionId },
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  }

  async markCompleted(paymentId: number, transaction: Transaction): Promise<void> {
    await Payment.update(
      { status: 'completed' as PaymentStatus, completedAt: new Date() },
      { where: { id: paymentId }, transaction },
    );
  }

  async tryInsertWebhookEvent(
    stripeEventId: string,
    eventType: string,
    transaction: Transaction,
  ): Promise<boolean> {
    try {
      await StripeWebhookEvent.create(
        { stripeEventId, eventType, processedAt: new Date() },
        { transaction },
      );
      return true;
    } catch (err: unknown) {
      const e = err as { name?: string; original?: { code?: string } };
      if (e.name === 'SequelizeUniqueConstraintError' || e.original?.code === 'ER_DUP_ENTRY') {
        return false;
      }
      throw err;
    }
  }
}
