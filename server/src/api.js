import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PORT = process.env.PORT || 45330;
export const WORKFLOW_APP_ROOT = path.resolve(__dirname, '../..');
export const WORKSPACE_ROOT = path.resolve(WORKFLOW_APP_ROOT, '..');
export const DATA_DIR = path.join(WORKFLOW_APP_ROOT, 'data');
export const SCRIPTS_DIR = path.join(WORKFLOW_APP_ROOT, 'scripts');
export const SCHEMAS_DIR = path.join(WORKFLOW_APP_ROOT, 'schemas');
export const TASK_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'task.schema.json');
export const TASK_SCHEMA_REF = '../../../schemas/task.schema.json';

// Ensure base data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

// Detect project ecosystem tags as an array
export function detectProjectTags(projectPath) {
  const tags = [];
  const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
  const hasCargo = fs.existsSync(path.join(projectPath, 'Cargo.toml'));
  const hasPyproject = fs.existsSync(path.join(projectPath, 'pyproject.toml')) || fs.existsSync(path.join(projectPath, 'requirements.txt'));
  const hasGo = fs.existsSync(path.join(projectPath, 'go.mod'));

  if (hasPackageJson) tags.push('Node / JS');
  if (hasCargo) tags.push('Rust');
  if (hasPyproject) tags.push('Python');
  if (hasGo) tags.push('Go');

  if (tags.length === 0) {
    tags.push('General');
  }
  return tags;
}

// Helper: Auto-remove trailing whitespace on each line and trim outer whitespace
export function cleanText(str) {
  if (typeof str !== 'string') return '';
  return str
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

export function createWorkflowApi() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Static serving for uploaded screenshot assets
  app.use('/data', express.static(DATA_DIR));

  // Helper: Ensure project directories exist
  function ensureProjectDirs(projectName) {
    const safeName = path.basename(projectName);
    const projectDir = path.join(DATA_DIR, safeName);
    const tasksDir = path.join(projectDir, 'tasks');
    const assetsDir = path.join(projectDir, 'assets');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    return { projectDir, tasksDir, assetsDir };
  }

  // Multer memory storage for computing SHA-256 hashes before disk write
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  // -------------------------------------------------------------
  // 1. Scan Workspace Projects
  // -------------------------------------------------------------
  app.get('/api/workspace-projects', (req, res) => {
    try {
      const entries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
      const ignored = new Set(['.git', '.vscode', 'TEMP-LLM-BUCKET', 'node_modules', 'dist']);

      const projects = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && !ignored.has(e.name))
        .map(e => {
          const fullPath = path.join(WORKSPACE_ROOT, e.name);
          const hasGit = fs.existsSync(path.join(fullPath, '.git'));
          const isTracked = fs.existsSync(path.join(DATA_DIR, e.name));
          const tags = detectProjectTags(fullPath);

          return {
            name: e.name,
            tag: tags[0],
            tags,
            hasGit,
            isTracked
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json(projects);
    } catch (err) {
      console.error('Error scanning workspace:', err);
      res.status(500).json({ error: 'Failed to scan workspace directories' });
    }
  });

  // -------------------------------------------------------------
  // 2. Tracked Projects in Workflow App
  // -------------------------------------------------------------
  app.get('/api/projects', (req, res) => {
    try {
      const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
      const projects = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => {
          const { tasksDir } = ensureProjectDirs(e.name);
          let taskFiles = [];
          try {
            taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
          } catch {
            taskFiles = [];
          }

          let total = taskFiles.length;
          let active = 0;
          let done = 0;
          let latestTimestamp = 0;

          for (const file of taskFiles) {
            try {
              const raw = fs.readFileSync(path.join(tasksDir, file), 'utf8');
              const data = JSON.parse(raw);
              if (data.done) done++;
              else active++;
              const taskModified = data.last_modified || data.timestamp || 0;
              if (taskModified > latestTimestamp) {
                latestTimestamp = taskModified;
              }
            } catch {
              // Ignore corrupted task file
            }
          }

          let dirMtime = 0;
          try {
            const stat = fs.statSync(path.join(DATA_DIR, e.name));
            dirMtime = Math.floor(stat.mtimeMs || 0);
          } catch {}
          if (latestTimestamp === 0) {
            latestTimestamp = dirMtime;
          }

          const projectWorkspacePath = path.join(WORKSPACE_ROOT, e.name);
          const tags = fs.existsSync(projectWorkspacePath) ? detectProjectTags(projectWorkspacePath) : ['General'];

          return {
            name: e.name,
            tag: tags[0],
            tags,
            totalTasks: total,
            activeTasks: active,
            doneTasks: done,
            latestTimestamp
          };
        })
        .sort((a, b) => {
          return b.latestTimestamp - a.latestTimestamp;
        });

      res.json(projects);
    } catch (err) {
      console.error('Error listing projects:', err);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  // Create/Pin project
  app.post('/api/projects', (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Project name is required' });
      }
      const safeName = path.basename(name.trim());
      ensureProjectDirs(safeName);
      res.json({ success: true, name: safeName });
    } catch (err) {
      console.error('Error creating project:', err);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // -------------------------------------------------------------
  // 3. Tasks CRUD
  // -------------------------------------------------------------
  app.get('/api/projects/:project/tasks', (req, res) => {
    try {
      const { project } = req.params;
      const { tasksDir } = ensureProjectDirs(project);

      const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      const tasks = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(tasksDir, file), 'utf8');
          const task = JSON.parse(raw);
          tasks.push(task);
        } catch (e) {
          console.warn(`Could not read task file ${file}:`, e.message);
        }
      }

      tasks.sort((a, b) => ((b.last_modified || b.timestamp || 0) - (a.last_modified || a.timestamp || 0)));
      res.json(tasks);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // Helper: Sanitize task assets to only store { filename, annotations } (no redundant url)
  function sanitizeAssets(assetsList) {
    if (!Array.isArray(assetsList)) return [];
    return assetsList
      .filter(a => a && a.filename)
      .map(a => ({
        filename: a.filename,
        annotations: Array.isArray(a.annotations) ? a.annotations : []
      }));
  }

  app.post('/api/projects/:project/tasks', (req, res) => {
    try {
      const { project } = req.params;
      const { task, assets, answer, done } = req.body;
      const { tasksDir } = ensureProjectDirs(project);

      // Generate clean sequential integer ID (e.g. "1", "2", "3")
      const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      let maxNum = 0;
      for (const f of files) {
        const base = path.basename(f, '.json');
        const num = parseInt(base.replace(/^task_/, ''), 10);
        if (!isNaN(num) && num < 1000000000000) { // filter out legacy 13-digit timestamps
          if (num > maxNum) maxNum = num;
        }
      }
      const nextId = String(maxNum + 1);
      const now = Date.now();
      const taskPayload = {
        id: nextId,
        project,
        timestamp: now,
        last_modified: now,
        task: cleanText(task),
        assets: sanitizeAssets(assets),
        answer: cleanText(answer),
        done: Boolean(done)
      };

      const filePath = path.join(tasksDir, `${nextId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(taskPayload, null, 2) + '\n', 'utf8');

      res.status(201).json(taskPayload);
    } catch (err) {
      console.error('Error creating task:', err);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  app.put('/api/projects/:project/tasks/:taskId', (req, res) => {
    try {
      const { project, taskId } = req.params;
      const safeTaskId = path.basename(taskId);
      const { tasksDir } = ensureProjectDirs(project);
      const filePath = path.join(tasksDir, `${safeTaskId}.json`);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const { $schema: _oldSchema, ...cleanExisting } = existing;
      const { $schema: _inSchema, ...cleanBody } = req.body;
      if (cleanExisting.assets) {
        cleanExisting.assets = sanitizeAssets(cleanExisting.assets);
      }
      if (cleanBody.assets) {
        cleanBody.assets = sanitizeAssets(cleanBody.assets);
      }
      if (cleanBody.task !== undefined) {
        cleanBody.task = cleanText(cleanBody.task);
      }
      if (cleanBody.answer !== undefined) {
        cleanBody.answer = cleanText(cleanBody.answer);
      }
      const now = Date.now();
      const updated = {
        ...cleanExisting,
        ...cleanBody,
        id: existing.id,
        project: existing.project,
        timestamp: existing.timestamp,
        last_modified: now
      };

      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
      res.json(updated);
    } catch (err) {
      console.error('Error updating task:', err);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  app.delete('/api/projects/:project/tasks/:taskId', (req, res) => {
    try {
      const { project, taskId } = req.params;
      const safeTaskId = path.basename(taskId);
      const { tasksDir } = ensureProjectDirs(project);
      const filePath = path.join(tasksDir, `${safeTaskId}.json`);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true, id: safeTaskId });
    } catch (err) {
      console.error('Error deleting task:', err);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // -------------------------------------------------------------
  // 4. Screenshot Uploads (Deduplicated via SHA-256 Content Hashing)
  // -------------------------------------------------------------
  app.post('/api/projects/:project/assets', upload.array('files', 50), (req, res) => {
    try {
      const { project } = req.params;
      const { assetsDir } = ensureProjectDirs(project);
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      // Read existing assets on disk to build a content-hash map
      const existingDiskFiles = fs.readdirSync(assetsDir).filter(f => !f.startsWith('.'));
      const existingHashMap = new Map(); // sha256 -> { filename, size, mtime }
      for (const fn of existingDiskFiles) {
        try {
          const fullPath = path.join(assetsDir, fn);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            const buffer = fs.readFileSync(fullPath);
            const hash = crypto.createHash('sha256').update(buffer).digest('hex');
            if (!existingHashMap.has(hash)) {
              existingHashMap.set(hash, { filename: fn, size: stat.size, mtime: stat.mtimeMs });
            }
          }
        } catch {}
      }

      const uploaded = [];

      for (const f of req.files) {
        // Calculate SHA-256 hash of the buffer
        const fullHash = crypto.createHash('sha256').update(f.buffer).digest('hex');
        const ext = (path.extname(f.originalname) || '.png').toLowerCase();
        const rawBase = path.basename(f.originalname, ext);
        // Clean original base name: NO timestamp prefix added!
        const cleanBase = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
        const cleanOriginalName = `${cleanBase}${ext}`;

        // Check if ANY existing asset on disk has the EXACT same SHA-256 content
        if (existingHashMap.has(fullHash)) {
          const existingMatch = existingHashMap.get(fullHash);
          uploaded.push({
            filename: existingMatch.filename,
            url: `/data/${project}/assets/${existingMatch.filename}`,
            size: existingMatch.size,
            hash: fullHash,
            deduplicated: true
          });
        } else {
          // Genuinely new content! Save with clean original name
          let targetFilename = cleanOriginalName;
          const targetPath = path.join(assetsDir, targetFilename);

          // If a file with this name already exists on disk but has DIFFERENT content, append short hash
          if (fs.existsSync(targetPath)) {
            const shortHash = fullHash.substring(0, 8);
            targetFilename = `${cleanBase}_${shortHash}${ext}`;
          }

          fs.writeFileSync(path.join(assetsDir, targetFilename), f.buffer);
          existingHashMap.set(fullHash, {
            filename: targetFilename,
            size: f.buffer.length,
            mtime: Date.now()
          });

          uploaded.push({
            filename: targetFilename,
            url: `/data/${project}/assets/${targetFilename}`,
            size: f.buffer.length,
            hash: fullHash,
            deduplicated: false
          });
        }
      }

      res.json({ success: true, files: uploaded });
    } catch (err) {
      console.error('Error uploading assets:', err);
      res.status(500).json({ error: 'Failed to upload assets' });
    }
  });

  // Deduplicate assets endpoint (resolves references to newest, removes older duplicates)
  app.post('/api/projects/:project/assets/dedupe', (req, res) => {
    try {
      const { project } = req.params;
      const result = dedupeProjectAssets(project);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('Error deduping assets:', err);
      res.status(500).json({ error: 'Failed to dedupe assets' });
    }
  });

  // Prune unreferenced orphan assets for a project
  app.post('/api/projects/:project/assets/prune', (req, res) => {
    try {
      const { project } = req.params;
      const { tasksDir, assetsDir } = ensureProjectDirs(project);

      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      const referencedFilenames = new Set();

      for (const tf of taskFiles) {
        try {
          const taskData = JSON.parse(fs.readFileSync(path.join(tasksDir, tf), 'utf8'));
          if (Array.isArray(taskData.assets)) {
            for (const a of taskData.assets) {
              if (a.filename) referencedFilenames.add(a.filename);
            }
          }
        } catch {}
      }

      const allAssetFiles = fs.readdirSync(assetsDir);
      let prunedCount = 0;

      for (const af of allAssetFiles) {
        if (!referencedFilenames.has(af)) {
          try {
            fs.unlinkSync(path.join(assetsDir, af));
            prunedCount++;
          } catch {}
        }
      }

      res.json({
        success: true,
        prunedCount,
        remainingCount: allAssetFiles.length - prunedCount
      });
    } catch (err) {
      console.error('Error pruning assets:', err);
      res.status(500).json({ error: 'Failed to prune assets' });
    }
  });

  // -------------------------------------------------------------
  // 5. Schema Endpoint
  // -------------------------------------------------------------
  app.get('/api/schema/task.json', (req, res) => {
    try {
      if (fs.existsSync(TASK_SCHEMA_PATH)) {
        res.setHeader('Content-Type', 'application/json');
        res.send(fs.readFileSync(TASK_SCHEMA_PATH, 'utf8'));
      } else {
        res.status(404).json({ error: 'Task schema file not found' });
      }
    } catch (err) {
      console.error('Error serving task schema:', err);
      res.status(500).json({ error: 'Failed to serve task schema' });
    }
  });

  // -------------------------------------------------------------
  // 6. Scripts Listing & Execution
  // -------------------------------------------------------------
  app.get('/api/scripts', (req, res) => {
    try {
      const scripts = [
        {
          id: 'check-orphaned-assets',
          name: 'Check Orphaned Assets',
          filename: 'check-orphaned-assets.js',
          description: 'Skanuje zadania i pliki w data/, wykrywając osierocone zrzuty ekranu oraz brakujące referencje.',
          descriptionEn: 'Scans tasks and files in data/, detecting unreferenced screenshots and missing references.',
          supportsProject: true,
          actions: [
            { id: 'check', label: 'Audyt (Bezpieczny)', labelEn: 'Audit (Safe Check)', args: [], isDanger: false },
            { id: 'prune', label: 'Usuń sieroty (Prune)', labelEn: 'Prune Orphans', args: ['--prune'], isDanger: true }
          ]
        },
        {
          id: 'dedupe-assets',
          name: 'Deduplicate Assets',
          filename: 'dedupe-assets.js',
          description: 'Wyszukuje duplikaty screenów po SHA-256, przepina zadania do najnowszego pliku i usuwa starsze kopie.',
          descriptionEn: 'Finds duplicate screenshots by SHA-256, redirects task references to newest file, and deletes older duplicates.',
          supportsProject: true,
          actions: [
            { id: 'dry-run', label: 'Podgląd (Dry-Run)', labelEn: 'Preview (Dry-Run)', args: ['--dry-run'], isDanger: false },
            { id: 'dedupe', label: 'Wykonaj Deduplikację', labelEn: 'Execute Deduplication', args: [], isDanger: true },
            { id: 'migrate-ids', label: 'Deduplikacja + Migracja ID (#1, #2)', labelEn: 'Dedupe + Migrate IDs (#1, #2)', args: ['--migrate-ids'], isDanger: true }
          ]
        }
      ];
      res.json(scripts);
    } catch (err) {
      console.error('Error listing scripts:', err);
      res.status(500).json({ error: 'Failed to list scripts' });
    }
  });

  app.post('/api/scripts/run', (req, res) => {
    try {
      const { scriptId, project, projects } = req.body;
      const validScripts = {
        'check-orphaned-assets': {
          file: 'check-orphaned-assets.js',
          allowedArgs: new Set(['--prune', '--fix', '--json', '--project'])
        },
        'dedupe-assets': {
          file: 'dedupe-assets.js',
          allowedArgs: new Set(['--dry-run', '-d', '--json', '--migrate-ids', '--project'])
        }
      };

      const scriptDef = validScripts[scriptId];
      if (!scriptDef) {
        return res.status(400).json({ error: `Invalid script ID: ${scriptId}` });
      }

      const scriptPath = path.join(SCRIPTS_DIR, scriptDef.file);
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ error: `Script file not found: ${scriptDef.file}` });
      }

      // Build safe args array
      const rawArgs = Array.isArray(req.body.args) ? req.body.args : [];
      const safeArgs = rawArgs.filter(a => typeof a === 'string' && scriptDef.allowedArgs.has(a));

      // Append project flag if targeted
      if (Array.isArray(projects) && projects.length > 0) {
        const safeProjects = projects
          .filter(p => typeof p === 'string' && p !== 'all')
          .map(p => path.basename(p));
        if (safeProjects.length > 0) {
          safeArgs.push('--project', safeProjects.join(','));
        }
      } else if (project && typeof project === 'string' && project !== 'all') {
        const safeProject = path.basename(project);
        safeArgs.push('--project', safeProject);
      }

      const startTime = Date.now();

      execFile('node', [scriptPath, ...safeArgs], {
        cwd: WORKFLOW_APP_ROOT,
        timeout: 30000,
        env: { ...process.env, FORCE_COLOR: '0' }
      }, (err, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const exitCode = err ? (err.code || (err.status !== undefined ? err.status : 1)) : 0;
        const output = (stdout || '') + (stderr ? ('\n' + stderr) : '');

        res.json({
          success: exitCode === 0,
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          output: output.trim(),
          durationMs,
          command: `node scripts/${scriptDef.file} ${safeArgs.join(' ')}`.trim()
        });
      });
    } catch (err) {
      console.error('Error running script:', err);
      res.status(500).json({ error: 'Failed to run script' });
    }
  });

  return app;
}

// -------------------------------------------------------------
// Asset Deduplication Helper
// Resolves duplicate assets by content hash (SHA-256):
// 1. Identifies duplicate groups
// 2. Selects the newest file ("ostatnio wysłany plik") as canonical winner
// 3. Updates all task references to the canonical winner
// 4. Deletes older duplicate files from disk
// -------------------------------------------------------------
export function dedupeProjectAssets(project, { dryRun = false } = {}) {
  const safeName = path.basename(project);
  const projectDir = path.join(DATA_DIR, safeName);
  const tasksDir = path.join(projectDir, 'tasks');
  const assetsDir = path.join(projectDir, 'assets');

  if (!fs.existsSync(assetsDir)) {
    return {
      project: safeName,
      duplicateGroups: 0,
      filesRemoved: 0,
      tasksUpdated: 0,
      reclaimedBytes: 0,
      resolutions: []
    };
  }

  const assetFiles = fs.readdirSync(assetsDir).filter(f => !f.startsWith('.'));
  const hashGroups = new Map(); // sha256 -> Array<{ filename, fullPath, size, timestamp }>

  for (const fn of assetFiles) {
    const fullPath = path.join(assetsDir, fn);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const buffer = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Determine upload/creation timestamp:
      // 1) check if filename starts with Unix timestamp ms (\d{13}_)
      const tsMatch = fn.match(/^(\d{13})_/);
      let nameTs = tsMatch ? parseInt(tsMatch[1], 10) : 0;
      let mtime = Math.floor(stat.mtimeMs || stat.ctimeMs || 0);
      const timestamp = Math.max(nameTs, mtime);

      if (!hashGroups.has(hash)) {
        hashGroups.set(hash, []);
      }
      hashGroups.get(hash).push({
        filename: fn,
        fullPath,
        size: stat.size,
        timestamp,
        mtime,
        nameTs
      });
    } catch {}
  }

  // Load all tasks for this project
  const taskFiles = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'))
    : [];

  const tasksData = [];
  for (const tf of taskFiles) {
    const taskPath = path.join(tasksDir, tf);
    try {
      const raw = fs.readFileSync(taskPath, 'utf8');
      const data = JSON.parse(raw);
      tasksData.push({ tf, taskPath, data });
    } catch {}
  }

  const resolutions = [];
  let filesRemoved = 0;
  let reclaimedBytes = 0;
  const modifiedTasks = new Set();

  for (const [hash, files] of hashGroups.entries()) {
    if (files.length <= 1) continue;

    // Sort descending by timestamp: highest timestamp = newest ("ostatnio wysłany plik")
    files.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      // Prefer cleaner filename (not starting with legacy timestamp prefix)
      const aHasPrefix = /^(\d{13})_/.test(a.filename);
      const bHasPrefix = /^(\d{13})_/.test(b.filename);
      if (aHasPrefix !== bHasPrefix) return aHasPrefix ? 1 : -1;
      return a.filename.localeCompare(b.filename);
    });

    const winner = files[0];
    const duplicatesToRemove = files.slice(1);

    const filenameReplacements = new Map();
    for (const d of duplicatesToRemove) {
      filenameReplacements.set(d.filename, winner.filename);
    }

    const updatedTaskIds = [];

    // Check all tasks to update references from older duplicates to winner
    for (const { tf, taskPath, data } of tasksData) {
      if (!Array.isArray(data.assets)) continue;
      let taskChanged = false;

      for (const asset of data.assets) {
        if (asset && filenameReplacements.has(asset.filename)) {
          asset.filename = winner.filename;
          taskChanged = true;
        }
      }

      // If task now has duplicate asset entries, deduplicate within task
      if (taskChanged) {
        const seenFilenames = new Set();
        data.assets = data.assets.filter(a => {
          if (!a || !a.filename) return false;
          if (seenFilenames.has(a.filename)) return false;
          seenFilenames.add(a.filename);
          return true;
        });

        if (!dryRun) {
          fs.writeFileSync(taskPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        }
        modifiedTasks.add(tf);
        updatedTaskIds.push(data.id || tf);
      }
    }

    // Delete older duplicate files from disk
    const removedNames = [];
    for (const d of duplicatesToRemove) {
      if (!dryRun) {
        try {
          fs.unlinkSync(d.fullPath);
          removedNames.push(d.filename);
          filesRemoved++;
          reclaimedBytes += d.size;
        } catch (err) {
          console.error(`Failed to delete duplicate ${d.filename}:`, err);
        }
      } else {
        removedNames.push(d.filename);
        filesRemoved++;
        reclaimedBytes += d.size;
      }
    }

    resolutions.push({
      hash: hash.substring(0, 16),
      kept: winner.filename,
      winnerTimestamp: winner.timestamp,
      removed: removedNames,
      updatedTaskIds
    });
  }

  return {
    project: safeName,
    duplicateGroups: resolutions.length,
    filesRemoved,
    tasksUpdated: modifiedTasks.size,
    reclaimedBytes,
    resolutions
  };
}
