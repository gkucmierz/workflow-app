import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkflowApi, PORT, WORKFLOW_APP_ROOT, DATA_DIR, WORKSPACE_ROOT } from './api.js';

const app = createWorkflowApi();

// Production static bundle serving
const uiDist = path.join(WORKFLOW_APP_ROOT, 'ui/dist');
const rootDist = path.join(WORKFLOW_APP_ROOT, 'dist');
const distDir = fs.existsSync(uiDist) ? uiDist : rootDist;
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/data')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  // In dev mode fallback, redirect to Vite dev port
  app.get('/', (req, res) => {
    const isSkyhook = (req.headers.host || '').includes('skyhook.7u.pl');
    const target = isSkyhook ? 'https://workflow-app.skyhook.7u.pl' : `http://localhost:${PORT}`;
    res.redirect(target);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Workflow App server listening on http://0.0.0.0:${PORT}`);
  console.log(`📂 Data directory: ${DATA_DIR}`);
  console.log(`💼 Workspace root: ${WORKSPACE_ROOT}`);
});
