import dotenv from 'dotenv';
import { beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import './env';

async function resetTestSchema(): Promise<void> {
  const cwd = path.resolve(__dirname, '..');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: process.env.DB_NAME || 'cultrux_test',
  };

  execSync('npx sequelize-cli db:migrate:undo:all', { cwd, env, stdio: 'pipe' });
  execSync('npx sequelize-cli db:migrate', { cwd, env, stdio: 'pipe' });
  execSync('npx sequelize-cli db:seed:all', { cwd, env, stdio: 'pipe' });
}

beforeAll(async () => {
  await resetTestSchema();
}, 120000);

afterAll(async () => {
  const { sequelize } = await import('../src/models');
  await sequelize.close();
});
