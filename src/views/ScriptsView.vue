<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { t, currentLang } from '../locales.js';
import { projects } from '../store/projects.js';
import ConfirmModal from '../components/ConfirmModal.vue';
import ProjectMultiSelect from '../components/ProjectMultiSelect.vue';

const router = useRouter();

// Available scripts and state
const scripts = ref([]);
const isLoadingScripts = ref(true);
const selectedProjects = ref([]); // Empty array = all projects
const isExecuting = ref(false);
const activeActionKey = ref('');

// Confirm Modal state for destructive actions
const isConfirmOpen = ref(false);
const pendingScript = ref(null);
const pendingAction = ref(null);

const projectScopeArgs = computed(() => {
  if (selectedProjects.value.length > 0 && selectedProjects.value.length < projects.value.length) {
    return ['--project', selectedProjects.value.join(',')];
  }
  return [];
});

const confirmDetails = computed(() => {
  if (!pendingScript.value || !pendingAction.value) return '';
  const args = [...(pendingAction.value.args || [])];
  if (pendingScript.value.supportsProject) {
    args.push(...projectScopeArgs.value);
  }
  return `node scripts/${pendingScript.value.filename} ${args.join(' ')}`.trim();
});

// Terminal output state
const terminalOutput = ref('');
const terminalCommand = ref('');
const terminalExitCode = ref(null);
const terminalDuration = ref(null);
const terminalStatus = ref('idle'); // 'idle' | 'running' | 'success' | 'failed'
const terminalRef = ref(null);
const isCopied = ref(false);

// Load available scripts from backend
const fetchScripts = async () => {
  try {
    isLoadingScripts.value = true;
    const res = await fetch('/api/scripts');
    if (res.ok) {
      scripts.value = await res.json();
    }
  } catch (err) {
    console.error('Failed to fetch scripts catalog:', err);
  } finally {
    isLoadingScripts.value = false;
  }
};

// Initiate action: prompt confirm modal if destructive, else run immediately
const runAction = (script, action) => {
  if (isExecuting.value) return;

  if (action.isDanger) {
    pendingScript.value = script;
    pendingAction.value = action;
    isConfirmOpen.value = true;
    return;
  }

  executeAction(script, action);
};

const onConfirmDanger = () => {
  const script = pendingScript.value;
  const action = pendingAction.value;
  isConfirmOpen.value = false;
  pendingScript.value = null;
  pendingAction.value = null;
  if (script && action) {
    executeAction(script, action);
  }
};

const onCancelDanger = () => {
  isConfirmOpen.value = false;
  pendingScript.value = null;
  pendingAction.value = null;
};

// Execute action subprocess via API
const executeAction = async (script, action) => {
  const actionKey = `${script.id}:${action.id}`;
  activeActionKey.value = actionKey;
  isExecuting.value = true;
  terminalStatus.value = 'running';
  terminalExitCode.value = null;
  terminalDuration.value = null;

  const projectScope = (script.supportsProject && selectedProjects.value.length > 0 && selectedProjects.value.length < projects.value.length)
    ? selectedProjects.value
    : null;

  const argsDisplay = [...(action.args || [])];
  if (projectScope) {
    argsDisplay.push('--project', projectScope.join(','));
  }
  terminalCommand.value = `node scripts/${script.filename} ${argsDisplay.join(' ')}`.trim();
  terminalOutput.value = `[Running...] ${terminalCommand.value}\n`;

  try {
    const res = await fetch('/api/scripts/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scriptId: script.id,
        args: action.args || [],
        projects: projectScope
      })
    });

    const data = await res.json();

    if (res.ok) {
      terminalOutput.value = data.output || '(No output produced)';
      terminalExitCode.value = data.exitCode;
      terminalDuration.value = data.durationMs;
      terminalStatus.value = data.success ? 'success' : 'failed';
      if (data.command) terminalCommand.value = data.command;
    } else {
      terminalOutput.value = `Error: ${data.error || 'Failed to execute script'}`;
      terminalExitCode.value = 1;
      terminalStatus.value = 'failed';
    }
  } catch (err) {
    terminalOutput.value = `Network/Execution Error: ${err.message}`;
    terminalExitCode.value = 1;
    terminalStatus.value = 'failed';
  } finally {
    isExecuting.value = false;
    activeActionKey.value = '';
    await nextTick();
    if (terminalRef.value) {
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight;
    }
  }
};

// Copy terminal output
const copyOutput = async () => {
  if (!terminalOutput.value) return;
  try {
    await navigator.clipboard.writeText(terminalOutput.value);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
  }
};

// Clear console
const clearConsole = () => {
  terminalOutput.value = '';
  terminalCommand.value = '';
  terminalExitCode.value = null;
  terminalDuration.value = null;
  terminalStatus.value = 'idle';
};

// Navigation / Back
const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};

// Keyboard ESC Dismissal (Rule 6.1)
const handleGlobalKeydown = (e) => {
  if (e.key === 'Escape') {
    if (isConfirmOpen.value) {
      e.preventDefault();
      e.stopPropagation();
      onCancelDanger();
      return;
    }
    e.stopPropagation();
    goBack();
  }
};

onMounted(() => {
  fetchScripts();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <main class="scripts-view">
    <div class="scripts-container glass-card">
      <!-- HEADER -->
      <header class="scripts-header">
        <div class="header-left">
          <button class="btn-back" @click="goBack">
            {{ t('scriptsView.backToBoard') }}
          </button>
          <div class="header-titles">
            <h1 class="view-title">🛠️ {{ t('scriptsView.title') }}</h1>
            <p class="view-subtitle">{{ t('scriptsView.subtitle') }}</p>
          </div>
        </div>

        <!-- Project Scope Selector -->
        <div class="header-right">
          <div class="scope-selector-wrapper">
            <span class="scope-label">{{ t('scriptsView.projectScope') }}</span>
            <ProjectMultiSelect
              v-model="selectedProjects"
              :projects="projects"
            />
          </div>
        </div>
      </header>

      <!-- SCRIPT CARDS GRID -->
      <section class="scripts-grid">
        <div
          v-for="script in scripts"
          :key="script.id"
          class="script-card"
        >
          <div class="card-top">
            <div class="card-heading">
              <h2 class="script-name">{{ script.name }}</h2>
              <span class="script-badge">{{ script.filename }}</span>
            </div>
            <p class="script-desc">
              {{ currentLang === 'pl' ? script.description : (script.descriptionEn || script.description) }}
            </p>
          </div>

          <div class="card-bottom">
            <div class="actions-list">
              <button
                v-for="action in script.actions"
                :key="action.id"
                class="btn-action"
                :class="[
                  action.isDanger ? 'btn-danger-action' : 'btn-safe',
                  { active: activeActionKey === `${script.id}:${action.id}` }
                ]"
                :disabled="isExecuting"
                @click="runAction(script, action)"
              >
                <span
                  v-if="activeActionKey === `${script.id}:${action.id}`"
                  class="action-spinner"
                ></span>
                <span class="action-icon">
                  {{ action.isDanger ? '⚡' : '▶' }}
                </span>
                <span>
                  {{ currentLang === 'pl' ? action.label : (action.labelEn || action.label) }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- TERMINAL CONSOLE PANE -->
      <section class="terminal-panel">
        <div class="terminal-header">
          <div class="term-left">
            <div class="mac-dots">
              <span class="mac-dot dot-close"></span>
              <span class="mac-dot dot-min"></span>
              <span class="mac-dot dot-max"></span>
            </div>
            <span class="term-title">{{ t('scriptsView.terminalOutput') }}</span>
          </div>

          <div class="term-right">
            <!-- Status Badge -->
            <span
              class="term-status-badge"
              :class="terminalStatus"
            >
              <span v-if="terminalStatus === 'running'" class="pulse-dot"></span>
              <span v-if="terminalStatus === 'idle'">{{ t('scriptsView.statusReady') }}</span>
              <span v-else-if="terminalStatus === 'running'">{{ t('scriptsView.statusRunning') }}</span>
              <span v-else-if="terminalStatus === 'success'">Exit 0 ({{ t('scriptsView.statusSuccess') }})</span>
              <span v-else-if="terminalStatus === 'failed'">Exit {{ terminalExitCode ?? 1 }} ({{ t('scriptsView.statusFailed') }})</span>
            </span>

            <!-- Duration Badge -->
            <span v-if="terminalDuration !== null" class="term-duration-badge">
              ⏱️ {{ terminalDuration }}ms
            </span>

            <!-- Copy Output Button -->
            <button
              class="btn-term-action"
              :disabled="!terminalOutput"
              @click="copyOutput"
            >
              {{ isCopied ? t('scriptsView.copied') : t('scriptsView.copyOutput') }}
            </button>

            <!-- Clear Console Button -->
            <button
              class="btn-term-action"
              :disabled="!terminalOutput && !terminalCommand"
              @click="clearConsole"
            >
              {{ t('scriptsView.clearConsole') }}
            </button>
          </div>
        </div>

        <div ref="terminalRef" class="terminal-body">
          <div v-if="terminalCommand" class="terminal-command-line">
            <span class="prompt-symbol">$</span>
            <span class="command-text">{{ terminalCommand }}</span>
          </div>
          <pre
            class="terminal-pre selectable"
            :class="{ placeholder: !terminalOutput }"
          >{{ terminalOutput || t('scriptsView.terminalPlaceholder') }}</pre>
        </div>
      </section>
    </div>

    <!-- Confirm Modal for Destructive Script Actions -->
    <ConfirmModal
      :is-open="isConfirmOpen"
      :details="confirmDetails"
      :is-danger="true"
      @confirm="onConfirmDanger"
      @cancel="onCancelDanger"
    />
  </main>
</template>

<style scoped>
.scripts-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
}

.scripts-container {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
}

/* HEADER */
.scripts-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
  gap: 16px;
  flex-wrap: wrap;
  -webkit-user-select: none;
  user-select: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-back {
  font-size: 0.88rem;
  font-weight: 700;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  outline: none !important;
  -webkit-user-select: none;
  user-select: none;
}

.btn-back:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-cyan-border);
  color: var(--accent-cyan);
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.view-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
  letter-spacing: -0.01em;
}

.view-subtitle {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scope-selector-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scope-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
}

/* SCRIPT CARDS GRID */
.scripts-grid {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
}

.script-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  gap: 16px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.script-card:hover {
  border-color: rgba(56, 189, 248, 0.3);
}

[data-theme="light"] .script-card:hover {
  border-color: rgba(2, 132, 199, 0.4);
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.script-name {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}

.script-badge {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
  -webkit-user-select: none;
  user-select: none;
}

.script-desc {
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text-muted);
  margin: 0;
}

.actions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-action {
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
  outline: none !important;
  -webkit-user-select: none;
  user-select: none;
}

.btn-safe {
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
}

.btn-safe:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.22);
  border-color: var(--accent-cyan);
}

[data-theme="light"] .btn-safe {
  background: rgba(2, 132, 199, 0.1);
  color: #0284c7;
  border: 1px solid rgba(2, 132, 199, 0.3);
}

[data-theme="light"] .btn-safe:hover:not(:disabled) {
  background: rgba(2, 132, 199, 0.18);
  border-color: #0284c7;
}

.btn-danger-action {
  background: rgba(239, 68, 68, 0.12);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn-danger-action:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.22);
  border-color: var(--accent-red);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-icon {
  font-size: 0.85rem;
  line-height: 1;
}

.action-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* TERMINAL CONSOLE PANE */
.terminal-panel {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  background: #090d16;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
}

[data-theme="light"] .terminal-panel {
  background: #0f172a;
  border-color: #334155;
}

.terminal-header {
  flex-shrink: 0;
  height: 42px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  -webkit-user-select: none;
  user-select: none;
}

[data-theme="light"] .terminal-header {
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

.term-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mac-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mac-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot-close { background: #ef4444; }
.dot-min { background: #f59e0b; }
.dot-max { background: #10b981; }

.term-title {
  font-size: 0.8rem;
  font-family: var(--font-mono);
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.04em;
}

.term-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.term-status-badge {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.term-status-badge.idle {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.term-status-badge.running {
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: var(--accent-cyan);
  border-radius: 50%;
  animation: pulse 1s infinite alternate;
}

@keyframes pulse {
  from { opacity: 0.3; }
  to { opacity: 1; }
}

.term-status-badge.success {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.term-status-badge.failed {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.term-duration-badge {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  font-weight: 600;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-term-action {
  height: 28px;
  padding: 0 10px;
  font-size: 0.74rem;
  font-family: var(--font-mono);
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none !important;
  -webkit-user-select: none;
  user-select: none;
}

.btn-term-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.btn-term-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.terminal-body {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: 0.84rem;
  line-height: 1.5;
  box-sizing: border-box;
}

.terminal-command-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #38bdf8;
  font-weight: 700;
}

.prompt-symbol {
  color: #4ade80;
  user-select: none;
}

.command-text {
  word-break: break-all;
}

.terminal-pre {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}

.terminal-pre.placeholder {
  color: #64748b;
  font-style: italic;
  user-select: none;
}

.terminal-pre.selectable {
  -webkit-user-select: text !important;
  user-select: text !important;
}
</style>
