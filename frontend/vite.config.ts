import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/** Browser refresh on /wallet or /campaigns must hit the SPA, not Express. */
function apiProxy(target = 'http://localhost:3000'): ProxyOptions {
  return {
    target,
    bypass(req) {
      // Navigation / refresh sends Accept: text/html — serve React instead of proxying
      if (req.headers.accept?.includes('text/html')) {
        return '/index.html';
      }
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': apiProxy(),
      '/currencies': apiProxy(),
      '/wallet': apiProxy(),
      '/checkout': apiProxy(),
      '/campaigns': apiProxy(),
      '/health': apiProxy(),
    },
  },
});
