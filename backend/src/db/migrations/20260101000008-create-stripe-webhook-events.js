'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stripe_webhook_events', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      stripe_event_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      event_type: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stripe_webhook_events');
  },
};
