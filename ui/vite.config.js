import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(async ({ command }) => {
  const plugins = [vue()];

  // Only attach the Express API middleware during local dev ('serve'), NEVER during 'build'
  if (command === 'serve') {
    try {
      const serverApiModule = '../server/src/api.js';
      const { createWorkflowApi } = await import(/* @vite-ignore */ serverApiModule);
      plugins.push({
        name: 'workflow-api',
        configureServer(server) {
          const app = createWorkflowApi();
          server.middlewares.use(app);
        }
      });
    } catch (err) {
      console.warn('[vite.config.js] Running in standalone UI mode');
    }
  }

  return {
    plugins,
    server: {
      host: '0.0.0.0',
      port: 45330,
      strictPort: true,
      allowedHosts: true
    }
  };
});
