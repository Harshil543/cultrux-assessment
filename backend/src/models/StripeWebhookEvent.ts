import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface StripeWebhookEventAttributes {
  id: number;
  stripeEventId: string;
  eventType: string;
  processedAt?: Date;
}

export type StripeWebhookEventCreationAttributes = Optional<
  StripeWebhookEventAttributes,
  'id' | 'processedAt'
>;

export class StripeWebhookEvent
  extends Model<StripeWebhookEventAttributes, StripeWebhookEventCreationAttributes>
  implements StripeWebhookEventAttributes
{
  declare id: number;
  declare stripeEventId: string;
  declare eventType: string;
  declare processedAt: Date;
}

export function initStripeWebhookEventModel(sequelize: Sequelize): typeof StripeWebhookEvent {
  StripeWebhookEvent.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      stripeEventId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        field: 'stripe_event_id',
      },
      eventType: {
        type: DataTypes.STRING(128),
        allowNull: false,
        field: 'event_type',
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'processed_at',
      },
    },
    {
      sequelize,
      tableName: 'stripe_webhook_events',
      underscored: true,
      updatedAt: false,
      createdAt: false,
    },
  );
  return StripeWebhookEvent;
}
