'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ledger_entries', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      wallet_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      currency_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'currencies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      delta_credits: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      entry_type: {
        type: Sequelize.ENUM('PURCHASE', 'SPEND'),
        allowNull: false,
      },
      reference_type: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      reference_id: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('ledger_entries', ['wallet_id', 'currency_id'], {
      name: 'idx_ledger_wallet_currency',
    });

    // Idempotent spends / purchases per reference (e.g. payment id, campaign id)
    await queryInterface.addConstraint('ledger_entries', {
      fields: ['reference_type', 'reference_id', 'currency_id', 'entry_type'],
      type: 'unique',
      name: 'uq_ledger_reference_currency_type',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ledger_entries');
  },
};
