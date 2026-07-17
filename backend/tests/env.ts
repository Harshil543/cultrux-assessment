import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'cultrux_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
