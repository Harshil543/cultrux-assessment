export const MODULES = {
  CAMPAIGNS: 'campaigns',
  REPORTS: 'reports',
  DISCOVERY: 'discovery',
} as const;

export type ModuleCode = (typeof MODULES)[keyof typeof MODULES];

export const CURRENCY_CODES = {
  CAMPAIGN: 'CAMPAIGN',
  REPORT: 'REPORT',
  DISCOVERY: 'DISCOVERY',
} as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[keyof typeof CURRENCY_CODES];

export const LEDGER_ENTRY_TYPES = {
  PURCHASE: 'PURCHASE',
  SPEND: 'SPEND',
} as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[keyof typeof LEDGER_ENTRY_TYPES];

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const CAMPAIGN_STATUS = {
  DRAFT: 'draft',
  FUNDED: 'funded',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];
