'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('currencies', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      module: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: 'Bound module: campaigns | reports | discovery',
      },
      per_credit_paise: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('currencies', ['module'], { name: 'idx_currencies_module' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('currencies');
  },
};
