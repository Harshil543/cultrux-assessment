'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    const currencies = [
      {
        id: 1,
        code: 'CAMPAIGN',
        name: 'Campaign Credits',
        module: 'campaigns',
        per_credit_paise: 300,
        is_active: true,
      },
      {
        id: 2,
        code: 'REPORT',
        name: 'Report Credits',
        module: 'reports',
        per_credit_paise: 1000,
        is_active: true,
      },
      {
        id: 3,
        code: 'DISCOVERY',
        name: 'Discovery Credits',
        module: 'discovery',
        per_credit_paise: 500,
        is_active: true,
      },
    ];

    for (const row of currencies) {
      await sequelize.query(
        `INSERT INTO currencies (id, code, name, module, per_credit_paise, is_active, created_at, updated_at)
         VALUES (:id, :code, :name, :module, :per_credit_paise, :is_active, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           module = VALUES(module),
           per_credit_paise = VALUES(per_credit_paise),
           is_active = VALUES(is_active),
           updated_at = NOW()`,
        { replacements: row },
      );
    }

    const [[planCountRow]] = await sequelize.query(
      'SELECT COUNT(*) AS count FROM currency_plans',
    );
    const planCount = Number(planCountRow.count);
    if (planCount > 0) {
      return;
    }

    await queryInterface.bulkInsert('currency_plans', [
      {
        currency_id: 1,
        label: '100 Campaign Credits',
        credits: 100,
        total_paise: 30000,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        currency_id: 1,
        label: '1,000 Campaign Credits',
        credits: 1000,
        total_paise: 270000,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        currency_id: 2,
        label: '10 Report Credits',
        credits: 10,
        total_paise: 10000,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        currency_id: 2,
        label: '100 Report Credits',
        credits: 100,
        total_paise: 90000,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        currency_id: 3,
        label: '100 Discovery Credits',
        credits: 100,
        total_paise: 50000,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        currency_id: 3,
        label: '1,000 Discovery Credits',
        credits: 1000,
        total_paise: 450000,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('currency_plans', null, {});
    await queryInterface.bulkDelete('currencies', null, {});
  },
};
