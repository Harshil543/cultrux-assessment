'use strict';

/**
 * Payment lifecycle (expired/refunded/disputed), client idempotency keys,
 * Stripe payment_intent linkage, REFUND/CHARGEBACK ledger types,
 * and drop non-negative balance check so chargebacks after spend stay ledger-accurate.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE payments
      MODIFY COLUMN status ENUM(
        'pending',
        'completed',
        'failed',
        'expired',
        'refunded',
        'disputed'
      ) NOT NULL DEFAULT 'pending'
    `);

    await queryInterface.addColumn('payments', 'client_idempotency_key', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });

    await queryInterface.addColumn('payments', 'stripe_payment_intent_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      unique: true,
    });

    await queryInterface.addColumn('payments', 'failure_reason', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addIndex('payments', ['user_id', 'client_idempotency_key'], {
      unique: true,
      name: 'uq_payments_user_idempotency_key',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE ledger_entries
      MODIFY COLUMN entry_type ENUM(
        'PURCHASE',
        'SPEND',
        'REFUND',
        'CHARGEBACK'
      ) NOT NULL
    `);

    // Chargebacks/refunds after spend must still reverse the full PURCHASE in the ledger.
    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE wallet_balances DROP CHECK chk_wallet_balances_non_negative',
      );
    } catch {
      // Already dropped or not present
    }
  },

  async down(queryInterface) {
    // Clear values that cannot fit the narrower ENUMs
    await queryInterface.sequelize.query(
      "DELETE FROM ledger_entries WHERE entry_type IN ('REFUND', 'CHARGEBACK')",
    );
    await queryInterface.sequelize.query(
      "UPDATE payments SET status = 'failed' WHERE status IN ('expired', 'refunded', 'disputed')",
    );

    await queryInterface.removeIndex('payments', 'uq_payments_user_idempotency_key');
    await queryInterface.removeColumn('payments', 'failure_reason');
    await queryInterface.removeColumn('payments', 'stripe_payment_intent_id');
    await queryInterface.removeColumn('payments', 'client_idempotency_key');

    await queryInterface.sequelize.query(`
      ALTER TABLE ledger_entries
      MODIFY COLUMN entry_type ENUM('PURCHASE', 'SPEND') NOT NULL
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE payments
      MODIFY COLUMN status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending'
    `);

    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE wallet_balances DROP CHECK chk_wallet_balances_non_negative',
      );
    } catch {
      // ignore
    }
    await queryInterface.sequelize.query(
      'ALTER TABLE wallet_balances ADD CONSTRAINT chk_wallet_balances_non_negative CHECK (balance_credits >= 0)',
    );
  },
};
