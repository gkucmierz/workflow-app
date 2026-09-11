import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(async ({ command }) => {
  const plugins = [vue()];

  // Only attach the Express API middleware during local dev ('serve'), NEVER during 'build'
  if (command === 'serve') {
    try {
      const serverApiUrl = new URL('../server/src/api.js', import.meta.url).href;
      const { createWorkflowApi } = await import(/* @vite-ignore */ serverApiUrl);
      plugins.push({
        name: 'workflow-api',
        configureServer(server) {
          const app = createWorkflowApi();
          server.middlewares.use(app);
        }
      });
    } catch (err) {
      console.warn('[vite.config.js] Running in standalone UI mode:', err.message);
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
