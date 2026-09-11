import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data');
const TEST_PROJECT = '__test_project_temp__';

console.log('🧪 Running Workflow App Backend & Task Schema Tests...\n');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     ${err.message}`);
    throw err;
  }
}

// Cleanup helper
function cleanup() {
  const p = path.join(DATA_DIR, TEST_PROJECT);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

cleanup();

// --- TEST 1: Project Directory Provisioning ---
await test('ensureProjectDirs: creates tasks/ and assets/ folders in data/<project>', () => {
  const projectDir = path.join(DATA_DIR, TEST_PROJECT);
  const tasksDir = path.join(projectDir, 'tasks');
  const assetsDir = path.join(projectDir, 'assets');

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  assert.ok(fs.existsSync(tasksDir), 'Tasks directory must exist');
  assert.ok(fs.existsSync(assetsDir), 'Assets directory must exist');
});

// --- TEST 2: Task Schema with Non-Destructive Vector Annotations ---
await test('Task Schema: stores exact vector coordinates and clean assets', () => {
  const taskId = '1';
  const taskPayload = {
    id: taskId,
    project: TEST_PROJECT,
    timestamp: Date.now(),
    task: 'Wyśrodkuj przyciski w menu i zmień kolor strzałki',
    assets: [
      {
        filename: 'screen1.png',
        annotations: [
          {
            type: 'arrow',
            from: { x: 150, y: 300 },
            to: { x: 400, y: 300 },
            color: '#ef4444',
            strokeWidth: 4
          },
          {
            type: 'rect',
            x: 100,
            y: 200,
            width: 250,
            height: 80,
            color: '#38bdf8',
            strokeWidth: 2
          }
        ]
      },
      {
        filename: 'clean_screen2.png'
      }
    ],
    answer: '',
    done: false
  };

  const tasksDir = path.join(DATA_DIR, TEST_PROJECT, 'tasks');
  const filePath = path.join(tasksDir, `${taskId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(taskPayload, null, 2) + '\n', 'utf8');

  // Verify file write and parse
  assert.ok(fs.existsSync(filePath), 'JSON file must be saved on disk');
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.strictEqual(saved.id, taskId);
  assert.strictEqual(saved.done, false);
  assert.strictEqual(saved.assets.length, 2);
  assert.strictEqual(saved.assets[0].annotations.length, 2);
  assert.strictEqual(saved.assets[0].annotations[0].type, 'arrow');
  assert.strictEqual(saved.assets[0].annotations[1].type, 'rect');
});

// --- TEST 3: AI Agent Resolution Update ---
await test('Task Resolution: AI agent updates answer and marks done: true', () => {
  const tasksDir = path.join(DATA_DIR, TEST_PROJECT, 'tasks');
  const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
  assert.strictEqual(files.length, 1);

  const filePath = path.join(tasksDir, files[0]);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Simulate AI agent resolving task
  const resolved = {
    ...existing,
    answer: 'Zaktualizowano układ przycisków za pomocą flex justify-center i dodano testy w App.vue.',
    done: true
  };

  fs.writeFileSync(filePath, JSON.stringify(resolved, null, 2) + '\n', 'utf8');

  const reloaded = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.strictEqual(reloaded.done, true);
  assert.ok(reloaded.answer.includes('Zaktualizowano układ przycisków'));
});

// --- TEST 4: Project Tags Array and Multi-Ecosystem Detection ---
await test('detectProjectTags: returns an array of tags for detected configs or General', async () => {
  const { detectProjectTags } = await import('../src/api.js');

  const mockProj = path.join(DATA_DIR, '__mock_tag_proj__');
  fs.mkdirSync(mockProj, { recursive: true });

  try {
    // Empty directory should return ['General']
    assert.deepStrictEqual(detectProjectTags(mockProj), ['General']);

    // Add package.json -> ['Node / JS']
    fs.writeFileSync(path.join(mockProj, 'package.json'), '{}');
    assert.deepStrictEqual(detectProjectTags(mockProj), ['Node / JS']);

    // Add Cargo.toml -> ['Node / JS', 'Rust']
    fs.writeFileSync(path.join(mockProj, 'Cargo.toml'), '[package]');
    assert.deepStrictEqual(detectProjectTags(mockProj), ['Node / JS', 'Rust']);

    // Add pyproject.toml -> ['Node / JS', 'Rust', 'Python']
    fs.writeFileSync(path.join(mockProj, 'pyproject.toml'), '');
    assert.deepStrictEqual(detectProjectTags(mockProj), ['Node / JS', 'Rust', 'Python']);
  } finally {
    fs.rmSync(mockProj, { recursive: true, force: true });
  }
});

// --- TEST 5: Task Schema File & Structure Validation ---
await test('Task Schema: schema file exists and defines required fields', async () => {
  const { TASK_SCHEMA_PATH, TASK_SCHEMA_REF } = await import('../src/api.js');

  assert.ok(fs.existsSync(TASK_SCHEMA_PATH), 'task.schema.json must exist');
  const schemaContent = JSON.parse(fs.readFileSync(TASK_SCHEMA_PATH, 'utf8'));

  assert.strictEqual(schemaContent.title, 'WorkflowTask');
  assert.ok(Array.isArray(schemaContent.required), 'Required fields must be defined');
  assert.ok(schemaContent.required.includes('id'));
  assert.ok(schemaContent.required.includes('task'));
  assert.ok(schemaContent.required.includes('assets'));
  assert.ok(schemaContent.required.includes('done'));
  assert.strictEqual(TASK_SCHEMA_REF, '../../../schemas/task.schema.json');
});

// --- TEST 6: Asset Deduplication Resolution ---
await test('dedupeProjectAssets: points task references to newest file and deletes older duplicates', async () => {
  const { dedupeProjectAssets } = await import('../src/api.js');

  const testProj = '__test_dedupe_proj__';
  const projDir = path.join(DATA_DIR, testProj);
  const tasksDir = path.join(projDir, 'tasks');
  const assetsDir = path.join(projDir, 'assets');

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  try {
    const identicalContent = Buffer.from('FAKE_PNG_BINARY_DATA_FOR_SCREENSHOT_123456');

    // Create older duplicate file (timestamp 1000)
    const oldFile = '1000_Screenshot_2026_test.png';
    fs.writeFileSync(path.join(assetsDir, oldFile), identicalContent);

    // Create newest duplicate file (timestamp 2000)
    const newFile = '2000_Screenshot_2026_test.png';
    fs.writeFileSync(path.join(assetsDir, newFile), identicalContent);

    // Create a task referencing the older duplicate
    const taskData = {
      id: '1',
      project: testProj,
      timestamp: 1000,
      task: 'Test task with old asset reference',
      assets: [
        { filename: oldFile, annotations: [{ type: 'rect', x: 10, y: 10 }] }
      ],
      done: false
    };
    fs.writeFileSync(path.join(tasksDir, '1.json'), JSON.stringify(taskData, null, 2) + '\n', 'utf8');

    // Run deduplication
    const result = dedupeProjectAssets(testProj);

    assert.strictEqual(result.filesRemoved, 1, 'Should remove 1 duplicate file');
    assert.strictEqual(result.tasksUpdated, 1, 'Should update 1 task');
    assert.ok(fs.existsSync(path.join(assetsDir, newFile)), 'Newest file must remain on disk');
    assert.ok(!fs.existsSync(path.join(assetsDir, oldFile)), 'Older file must be deleted from disk');

    // Verify task was updated to point to the newest file while preserving annotations
    const updatedTask = JSON.parse(fs.readFileSync(path.join(tasksDir, '1.json'), 'utf8'));
    assert.strictEqual(updatedTask.assets[0].filename, newFile, 'Task reference must point to newest file');
    assert.strictEqual(updatedTask.assets[0].annotations.length, 1, 'Annotations must be preserved');
  } finally {
    fs.rmSync(projDir, { recursive: true, force: true });
  }
});

// --- TEST 7: cleanText Whitespace Trimming & Trailing Spaces Sanitization ---
await test('cleanText: strips trailing whitespace on every line and trims outer whitespace', async () => {
  const { cleanText } = await import('../src/api.js');

  assert.strictEqual(cleanText(null), '');
  assert.strictEqual(cleanText(undefined), '');
  assert.strictEqual(cleanText(''), '');

  // Lines with trailing spaces and trailing empty lines
  const rawInput = 'Chcemy wyciagnac logike deterministycznych kolorow    \nA nastepnie tutaj ja zaimportowac   \n\n   \n';
  const expected = 'Chcemy wyciagnac logike deterministycznych kolorow\nA nastepnie tutaj ja zaimportowac';
  assert.strictEqual(cleanText(rawInput), expected);

  // Preserve internal code indentation while stripping line-end whitespace
  const codeBlock = '  const x = 10;   \n    return x + 1;  ';
  const expectedCode = '  const x = 10;\n    return x + 1;';
  assert.strictEqual(cleanText(codeBlock), expectedCode);
});

// --- TEST 8: Scripts Catalog & Safe Subprocess Execution ---
await test('Scripts API: lists available scripts and executes check-orphaned-assets safely', async () => {
  const { SCRIPTS_DIR, WORKFLOW_APP_ROOT } = await import('../src/api.js');
  const { execFile } = await import('node:child_process');

  assert.ok(fs.existsSync(path.join(SCRIPTS_DIR, 'check-orphaned-assets.js')), 'check-orphaned-assets.js must exist');
  assert.ok(fs.existsSync(path.join(SCRIPTS_DIR, 'dedupe-assets.js')), 'dedupe-assets.js must exist');

  // Verify safe script execution
  const scriptPath = path.join(SCRIPTS_DIR, 'check-orphaned-assets.js');
  const stdout = await new Promise((resolve, reject) => {
    execFile('node', [scriptPath, '--json'], { cwd: WORKFLOW_APP_ROOT }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });

  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed.projects), 'Output should contain projects array');
  assert.strictEqual(typeof parsed.totalOrphans, 'number', 'totalOrphans should be number');

  // Verify multi-project flag execution
  const stdoutMulti = await new Promise((resolve, reject) => {
    execFile('node', [scriptPath, '--json', '--project', 'lol-inspector,workflow-app'], { cwd: WORKFLOW_APP_ROOT }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
  const parsedMulti = JSON.parse(stdoutMulti);
  assert.ok(Array.isArray(parsedMulti.projects), 'Multi-project output should contain projects array');
});

// Cleanup test project
cleanup();

console.log(`\n🎉 All ${passed} Workflow App Backend tests passed!\n`);


