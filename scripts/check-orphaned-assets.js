#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const args = process.argv.slice(2);
const shouldPrune = args.includes('--prune') || args.includes('--fix');
const isJson = args.includes('--json');

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

function computeSha256(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function checkOrphanedAssets() {
  if (!fs.existsSync(DATA_DIR)) {
    if (!isJson) console.log('📂 No data directory found.');
    return { projects: [], totalOrphans: 0, totalDuplicates: 0, totalMissing: 0 };
  }

  let projectDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);

  if (targetProjects.size > 0) {
    projectDirs = projectDirs.filter(p => targetProjects.has(p));
  }

  const results = [];
  let totalOrphans = 0;
  let totalDuplicates = 0;
  let totalMissing = 0;
  let reclaimedBytes = 0;

  for (const project of projectDirs) {
    const projectDir = path.join(DATA_DIR, project);
    const tasksDir = path.join(projectDir, 'tasks');
    const assetsDir = path.join(projectDir, 'assets');

    const referencedAssets = new Map(); // filename -> Set of task IDs
    const existingAssets = new Map(); // filename -> { size, hash, fullPath }

    // 1. Scan tasks
    if (fs.existsSync(tasksDir)) {
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      for (const tf of taskFiles) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(tasksDir, tf), 'utf8'));
          if (Array.isArray(content.assets)) {
            for (const asset of content.assets) {
              const fname = asset?.filename;
              if (fname) {
                if (!referencedAssets.has(fname)) {
                  referencedAssets.set(fname, new Set());
                }
                referencedAssets.get(fname).add(content.id || tf);
              }
            }
          }
        } catch (err) {
          console.warn(`[WARN] Failed to parse task file ${tf}:`, err.message);
        }
      }
    }

    // 2. Scan assets directory
    if (fs.existsSync(assetsDir)) {
      const assetFiles = fs.readdirSync(assetsDir).filter(f => !f.startsWith('.'));
      for (const af of assetFiles) {
        const fullPath = path.join(assetsDir, af);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            const hash = computeSha256(fullPath);
            existingAssets.set(af, { size: stat.size, hash, fullPath });
          }
        } catch {}
      }
    }

    // 3. Detect orphans
    const orphans = [];
    for (const [fname, meta] of existingAssets.entries()) {
      if (!referencedAssets.has(fname)) {
        orphans.push({ filename: fname, size: meta.size, hash: meta.hash, fullPath: meta.fullPath });
        totalOrphans++;
        reclaimedBytes += meta.size;
      }
    }

    // 4. Detect missing references
    const missing = [];
    for (const [fname, taskIds] of referencedAssets.entries()) {
      if (!existingAssets.has(fname)) {
        missing.push({ filename: fname, referencedBy: Array.from(taskIds) });
        totalMissing++;
      }
    }

    // 5. Detect duplicate hashes among assets
    const hashGroups = new Map();
    for (const [fname, meta] of existingAssets.entries()) {
      if (!meta.hash) continue;
      if (!hashGroups.has(meta.hash)) {
        hashGroups.set(meta.hash, []);
      }
      hashGroups.get(meta.hash).push({ filename: fname, size: meta.size });
    }

    const duplicates = [];
    for (const [hash, files] of hashGroups.entries()) {
      if (files.length > 1) {
        duplicates.push({ hash, files });
        totalDuplicates += (files.length - 1);
      }
    }

    // 6. Prune if requested
    let prunedCount = 0;
    if (shouldPrune && orphans.length > 0) {
      for (const orphan of orphans) {
        try {
          fs.unlinkSync(orphan.fullPath);
          prunedCount++;
        } catch (err) {
          console.error(`Failed to delete ${orphan.filename}:`, err.message);
        }
      }
    }

    results.push({
      project,
      totalExistingAssets: existingAssets.size,
      totalReferencedAssets: referencedAssets.size,
      orphans,
      missing,
      duplicates,
      prunedCount
    });
  }

  return {
    projects: results,
    totalOrphans,
    totalDuplicates,
    totalMissing,
    reclaimedBytes
  };
}

const report = checkOrphanedAssets();

if (isJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.totalOrphans > 0 ? 1 : 0);
}

console.log('\n🔍 ==================== ASSET AUDIT REPORT ====================');
for (const p of report.projects) {
  console.log(`\n📁 Project: [${p.project}]`);
  console.log(`   - Total Assets on Disk: ${p.totalExistingAssets}`);
  console.log(`   - Referenced by Tasks:  ${p.totalReferencedAssets}`);

  if (p.orphans.length > 0) {
    console.log(`   ⚠️  Orphaned Assets (${p.orphans.length}):`);
    for (const o of p.orphans) {
      console.log(`      • ${o.filename} (${formatBytes(o.size)}) [SHA256: ${o.hash?.slice(0, 16)}...]`);
    }
    if (p.prunedCount > 0) {
      console.log(`      ✅ Pruned ${p.prunedCount} orphaned file(s).`);
    }
  } else {
    console.log('   ✅ No orphaned assets.');
  }

  if (p.duplicates.length > 0) {
    console.log(`   ⚠️  Duplicate Content (${p.duplicates.length} group(s)):`);
    for (const d of p.duplicates) {
      console.log(`      • SHA256: ${d.hash.slice(0, 16)}...`);
      for (const f of d.files) {
        console.log(`        - ${f.filename} (${formatBytes(f.size)})`);
      }
      console.log(`      💡 Tip: Run 'npm run dedupe:assets' to resolve duplicates and reclaim space.`);
    }
  }

  if (p.missing.length > 0) {
    console.log(`   ❌ Missing Asset Files (${p.missing.length}):`);
    for (const m of p.missing) {
      console.log(`      • ${m.filename} (referenced in: ${m.referencedBy.join(', ')})`);
    }
  }
}

console.log('\n📊 ======================= SUMMARY =======================');
console.log(`Total Orphaned Files: ${report.totalOrphans}`);
console.log(`Total Duplicate Files: ${report.totalDuplicates}`);
console.log(`Total Missing Files:   ${report.totalMissing}`);
if (shouldPrune) {
  console.log(`Space Reclaimed:       ${formatBytes(report.reclaimedBytes)}`);
} else if (report.totalOrphans > 0) {
  console.log(`Potential Space Reclaim: ${formatBytes(report.reclaimedBytes)} (run with --prune to clean up)`);
}
console.log('==========================================================\n');

// Exit with 1 if orphans or missing files exist (when not pruning)
if (!shouldPrune && (report.totalOrphans > 0 || report.totalMissing > 0)) {
  process.exit(1);
} else {
  process.exit(0);
}
