#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, dedupeProjectAssets } from '../server/src/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const isJson = args.includes('--json');
const shouldMigrateIds = args.includes('--migrate-ids');

// Collect all target projects from multiple --project flags or comma-separated values
const targetProjects = new Set();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project' && args[i + 1]) {
    args[i + 1].split(',').forEach(p => {
      const trimmed = p.trim();
      if (trimmed && trimmed !== 'all') targetProjects.add(trimmed);
    });
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function runDeduplication() {
  if (!fs.existsSync(DATA_DIR)) {
    if (!isJson) console.log('📂 No data directory found.');
    return { projects: [], totalDuplicatesRemoved: 0, totalTasksUpdated: 0, totalReclaimedBytes: 0 };
  }

  let projectDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);

  if (targetProjects.size > 0) {
    projectDirs = projectDirs.filter(p => targetProjects.has(p));
  }

  const reports = [];
  let totalDuplicatesRemoved = 0;
  let totalTasksUpdated = 0;
  let totalReclaimedBytes = 0;
  let migratedTasksCount = 0;

  for (const project of projectDirs) {
    const res = dedupeProjectAssets(project, { dryRun: isDryRun });
    reports.push(res);
    totalDuplicatesRemoved += res.filesRemoved;
    totalTasksUpdated += res.tasksUpdated;
    totalReclaimedBytes += res.reclaimedBytes;

    // Optional task ID sequential migration
    if (shouldMigrateIds && !isDryRun) {
      const tasksDir = path.join(DATA_DIR, project, 'tasks');
      if (fs.existsSync(tasksDir)) {
        const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
        const tasks = [];
        for (const tf of taskFiles) {
          try {
            const p = path.join(tasksDir, tf);
            const content = JSON.parse(fs.readFileSync(p, 'utf8'));
            tasks.push({ filename: tf, fullPath: p, content });
          } catch {}
        }
        tasks.sort((a, b) => (a.content.timestamp || 0) - (b.content.timestamp || 0));

        let currentSeq = 1;
        for (const item of tasks) {
          const newId = String(currentSeq++);
          if (item.content.id !== newId) {
            item.content.id = newId;
            const newPath = path.join(tasksDir, `${newId}.json`);
            fs.writeFileSync(newPath, JSON.stringify(item.content, null, 2) + '\n', 'utf8');
            if (item.fullPath !== newPath && fs.existsSync(item.fullPath)) {
              fs.unlinkSync(item.fullPath);
            }
            migratedTasksCount++;
          }
        }
      }
    }
  }

  return {
    isDryRun,
    projects: reports,
    totalDuplicatesRemoved,
    totalTasksUpdated,
    totalReclaimedBytes,
    migratedTasksCount
  };
}

const summary = runDeduplication();

if (isJson) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

console.log(`\n🧹 ==================== ASSET DEDUPLICATION REPORT ====================`);
if (summary.isDryRun) {
  console.log(`ℹ️  MODE: DRY-RUN (No files modified or deleted)`);
}

for (const p of summary.projects) {
  console.log(`\n📁 Project: [${p.project}]`);
  if (p.resolutions.length === 0) {
    console.log(`   ✅ No duplicate assets found.`);
  } else {
    for (const r of p.resolutions) {
      console.log(`   • Content Hash (SHA-256: ${r.hash}...)`);
      console.log(`     - Kept (newest):    ${r.kept}`);
      for (const rem of r.removed) {
        console.log(`     - Removed (older):  ${rem}`);
      }
      if (r.updatedTaskIds.length > 0) {
        console.log(`     - Updated Tasks:    ${r.updatedTaskIds.join(', ')}`);
      } else {
        console.log(`     - Updated Tasks:    none (unreferenced duplicate)`);
      }
    }
  }
}

console.log(`\n📊 ======================= SUMMARY =======================`);
console.log(`Duplicate Files Removed: ${summary.totalDuplicatesRemoved}`);
console.log(`Tasks Updated:           ${summary.totalTasksUpdated}`);
console.log(`Space Reclaimed:         ${formatBytes(summary.totalReclaimedBytes)}`);
if (summary.migratedTasksCount > 0) {
  console.log(`Tasks Migrated to 1..N:  ${summary.migratedTasksCount}`);
}
console.log(`==========================================================\n`);
