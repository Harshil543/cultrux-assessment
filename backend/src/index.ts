import { createApp } from './app';
import { env } from './config/env';
import { sequelize } from './models';

async function main(): Promise<void> {
  await sequelize.authenticate();
  console.log('[db] connected');

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
