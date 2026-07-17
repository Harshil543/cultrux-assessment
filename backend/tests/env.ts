import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'cultrux_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
// Enough for Stripe SDK + generateTestHeaderString / constructEvent in HTTP tests
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || 'sk_test_cultrux_placeholder_key_12345';
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')
    ? process.env.STRIPE_WEBHOOK_SECRET
    : 'whsec_test_cultrux_webhook_secret';
