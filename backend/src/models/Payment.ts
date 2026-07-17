import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { PaymentStatus } from '../common/constants';

export interface PaymentAttributes {
  id: number;
  userId: number;
  currencyId: number;
  creditsToGrant: number;
  amountPaise: number;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  clientIdempotencyKey: string | null;
  failureReason: string | null;
  status: PaymentStatus;
  completedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PaymentCreationAttributes = Optional<
  PaymentAttributes,
  | 'id'
  | 'stripeSessionId'
  | 'stripePaymentIntentId'
  | 'clientIdempotencyKey'
  | 'failureReason'
  | 'status'
  | 'completedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export class Payment
  extends Model<PaymentAttributes, PaymentCreationAttributes>
  implements PaymentAttributes
{
  declare id: number;
  declare userId: number;
  declare currencyId: number;
  declare creditsToGrant: number;
  declare amountPaise: number;
  declare stripeSessionId: string | null;
  declare stripePaymentIntentId: string | null;
  declare clientIdempotencyKey: string | null;
  declare failureReason: string | null;
  declare status: PaymentStatus;
  declare completedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initPaymentModel(sequelize: Sequelize): typeof Payment {
  Payment.init(
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
      currencyId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'currency_id',
      },
      creditsToGrant: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'credits_to_grant',
      },
      amountPaise: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'amount_paise',
      },
      stripeSessionId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        field: 'stripe_session_id',
      },
      stripePaymentIntentId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        field: 'stripe_payment_intent_id',
      },
      clientIdempotencyKey: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'client_idempotency_key',
      },
      failureReason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'failure_reason',
      },
      status: {
        type: DataTypes.ENUM(
          'pending',
          'completed',
          'failed',
          'expired',
          'refunded',
          'disputed',
        ),
        allowNull: false,
        defaultValue: 'pending',
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'completed_at',
      },
    },
    {
      sequelize,
      tableName: 'payments',
      underscored: true,
    },
  );
  return Payment;
}
