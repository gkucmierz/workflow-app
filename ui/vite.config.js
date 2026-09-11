import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createWorkflowApi } from '../server/src/api.js';

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'workflow-api',
      configureServer(server) {
        const app = createWorkflowApi();
        server.middlewares.use(app);
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 45330,
    strictPort: true,
    allowedHosts: true
  }
});
