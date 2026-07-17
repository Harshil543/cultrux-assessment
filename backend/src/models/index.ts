import { Sequelize } from 'sequelize';
import { env } from '../config/env';
import { initUserModel, User } from './User';
import { initCurrencyModel, Currency } from './Currency';
import { initCurrencyPlanModel, CurrencyPlan } from './CurrencyPlan';
import { initWalletModel, Wallet } from './Wallet';
import { initWalletBalanceModel, WalletBalance } from './WalletBalance';
import { initLedgerEntryModel, LedgerEntry } from './LedgerEntry';
import { initPaymentModel, Payment } from './Payment';
import { initStripeWebhookEventModel, StripeWebhookEvent } from './StripeWebhookEvent';
import { initCampaignModel, Campaign } from './Campaign';

const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: 'mysql',
  logging: env.nodeEnv === 'development' ? false : false,
});

initUserModel(sequelize);
initCurrencyModel(sequelize);
initCurrencyPlanModel(sequelize);
initWalletModel(sequelize);
initWalletBalanceModel(sequelize);
initLedgerEntryModel(sequelize);
initPaymentModel(sequelize);
initStripeWebhookEventModel(sequelize);
initCampaignModel(sequelize);

User.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet' });
Wallet.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Wallet.hasMany(WalletBalance, { foreignKey: 'walletId', as: 'balances' });
WalletBalance.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
WalletBalance.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });

Currency.hasMany(CurrencyPlan, { foreignKey: 'currencyId', as: 'plans' });
CurrencyPlan.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });

Wallet.hasMany(LedgerEntry, { foreignKey: 'walletId', as: 'ledgerEntries' });
LedgerEntry.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
LedgerEntry.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });

User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Payment.belongsTo(Currency, { foreignKey: 'currencyId', as: 'currency' });

User.hasMany(Campaign, { foreignKey: 'userId', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export {
  sequelize,
  User,
  Currency,
  CurrencyPlan,
  Wallet,
  WalletBalance,
  LedgerEntry,
  Payment,
  StripeWebhookEvent,
  Campaign,
};
