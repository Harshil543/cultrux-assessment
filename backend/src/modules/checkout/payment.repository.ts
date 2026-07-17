import { Transaction } from 'sequelize';
import { Payment, PaymentCreationAttributes } from '../../models/Payment';
import { StripeWebhookEvent } from '../../models/StripeWebhookEvent';
import { PAYMENT_STATUS, PaymentStatus } from '../../common/constants';

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

  async updateStripePaymentIntentId(
    paymentId: number,
    stripePaymentIntentId: string,
    transaction?: Transaction,
  ): Promise<void> {
    await Payment.update(
      { stripePaymentIntentId },
      { where: { id: paymentId }, transaction },
    );
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

  async findByStripePaymentIntentId(
    stripePaymentIntentId: string,
    transaction?: Transaction,
  ): Promise<Payment | null> {
    return Payment.findOne({
      where: { stripePaymentIntentId },
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  }

  async findByUserIdempotencyKey(
    userId: number,
    clientIdempotencyKey: string,
    transaction?: Transaction,
  ): Promise<Payment | null> {
    return Payment.findOne({
      where: { userId, clientIdempotencyKey },
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  }

  async markCompleted(paymentId: number, transaction: Transaction): Promise<void> {
    await Payment.update(
      { status: PAYMENT_STATUS.COMPLETED, completedAt: new Date(), failureReason: null },
      { where: { id: paymentId }, transaction },
    );
  }

  async markStatus(
    paymentId: number,
    status: PaymentStatus,
    failureReason: string | null,
    transaction: Transaction,
  ): Promise<void> {
    const patch: {
      status: PaymentStatus;
      failureReason: string | null;
      completedAt?: Date | null;
    } = { status, failureReason };

    if (status === PAYMENT_STATUS.COMPLETED) {
      patch.completedAt = new Date();
    }

    await Payment.update(patch, { where: { id: paymentId }, transaction });
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
