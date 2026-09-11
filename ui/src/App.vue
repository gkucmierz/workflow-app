<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { t, currentLang, toggleLang } from './locales.js';
import AddProjectModal from './components/AddProjectModal.vue';
import {
  projects,
  workspaceProjects,
  totalActiveTasks,
  fetchProjects,
  fetchWorkspaceProjects
} from './store/projects.js';

const route = useRoute();
const router = useRouter();

const isScriptsActive = computed(() => route.path === '/scripts');

const toggleScriptsRoute = () => {
  if (isScriptsActive.value) {
    router.push('/');
  } else {
    router.push('/scripts');
  }
};

// Theme handling
const theme = ref(localStorage.getItem('workflow-theme') || 'dark');

const applyTheme = () => {
  document.documentElement.setAttribute('data-theme', theme.value);
  document.documentElement.style.colorScheme = theme.value;
  localStorage.setItem('workflow-theme', theme.value);
};

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme();
};

// Modal
const isAddProjectOpen = ref(false);

// Add new project from workspace
const onProjectSelectedFromModal = async (projectName) => {
  try {
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName })
    });
    await fetchProjects();
    isAddProjectOpen.value = false;
    router.push(`/p/${projectName}`);
  } catch (err) {
    console.error('Failed to add project:', err);
  }
};

onMounted(() => {
  applyTheme();
  fetchProjects();
  fetchWorkspaceProjects();
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('preload');
  });
});
</script>

<template>
  <div class="app-layout">
    <!-- TOP NAVIGATION BAR -->
    <header class="navbar glass-panel">
      <div class="nav-left">
        <div class="brand" @click="router.push('/')">
          <span class="brand-icon">⚡</span>
          <span class="brand-name">{{ t('nav.brand') }}</span>
        </div>
        <div class="port-badge">PORT 45330</div>
      </div>

      <div class="nav-center">
        <div class="global-metric">
          <span class="metric-num">{{ totalActiveTasks }}</span>
          <span class="metric-lbl">{{ t('nav.activeTasks') }}</span>
        </div>
        <div class="global-divider"></div>
        <div class="global-metric">
          <span class="metric-num">{{ projects.length }}</span>
          <span class="metric-lbl">{{ t('nav.projects') }}</span>
        </div>
      </div>

      <div class="nav-right">
        <!-- Scripts View Toggle -->
        <button
          class="btn-scripts"
          :class="{ active: isScriptsActive }"
          @click="toggleScriptsRoute"
        >
          <span class="icon">🛠️</span>
          <span>{{ t('nav.scripts') }}</span>
        </button>

        <!-- Language Switcher (EN / PL) -->
        <button
          class="lang-toggle-btn"
          @click="toggleLang"
        >
          <span class="lang-label">{{ currentLang.toUpperCase() }}</span>
        </button>

        <!-- Theme Switcher (Fixed-width icon) -->
        <button
          class="theme-toggle-btn"
          @click="toggleTheme"
        >
          <span class="theme-icon">{{ theme === 'dark' ? '☀️' : '🌙' }}</span>
        </button>

        <button class="btn-add-project" @click="isAddProjectOpen = true">
          <span class="icon">+</span>
          <span>{{ t('nav.addProject') }}</span>
        </button>
      </div>
    </header>

    <!-- ROUTER VIEW (BoardView or TaskEditorView) -->
    <router-view />

    <!-- ADD PROJECT MODAL -->
    <AddProjectModal
      :is-open="isAddProjectOpen"
      :workspace-projects="workspaceProjects"
      :tracked-project-names="projects.map(p => p.name)"
      @close="isAddProjectOpen = false"
      @select="onProjectSelectedFromModal"
    />
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px 24px;
  gap: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

/* NAVBAR */
.navbar {
  height: 60px;
  padding: 0 0 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 12px;
  -webkit-user-select: none;
  user-select: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: -0.02em;
  color: var(--text-main);
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.brand-icon {
  font-size: 1.3rem;
  -webkit-user-select: none;
  user-select: none;
}

.port-badge {
  font-size: 0.7rem;
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

.nav-center {
  display: flex;
  align-items: center;
  gap: 16px;
  -webkit-user-select: none;
  user-select: none;
}

.global-metric {
  display: flex;
  align-items: baseline;
  gap: 6px;
  -webkit-user-select: none;
  user-select: none;
}

.metric-num {
  font-size: 1.25rem;
  font-weight: 800;
  font-family: var(--font-mono);
  color: var(--accent-cyan);
}

.metric-lbl {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.global-divider {
  width: 1px;
  height: 20px;
  background: var(--border-subtle);
}

.nav-right {
  height: 100%;
  display: flex;
  align-items: stretch;
  gap: 0;
  margin: 0;
  padding: 0;
  -webkit-user-select: none;
  user-select: none;
}

.lang-toggle-btn {
  width: 56px;
  height: 100%;
  padding: 0;
  margin: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-main);
  border: none;
  border-left: 1px solid var(--border-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
  -webkit-user-select: none;
  user-select: none;
  font-weight: 700;
  font-size: 0.82rem;
  letter-spacing: 0.05em;
  font-family: var(--font-mono);
  outline: none !important;
}

.lang-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--accent-cyan);
}

.lang-toggle-btn:active {
  background: rgba(255, 255, 255, 0.14);
}

[data-theme="light"] .lang-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--accent-cyan);
}

[data-theme="light"] .lang-toggle-btn:active {
  background: rgba(0, 0, 0, 0.11);
}

.theme-toggle-btn {
  width: 56px;
  height: 100%;
  padding: 0;
  margin: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-main);
  border: none;
  border-left: 1px solid var(--border-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
  -webkit-user-select: none;
  user-select: none;
  outline: none !important;
}

.theme-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.theme-toggle-btn:active {
  background: rgba(255, 255, 255, 0.14);
}

[data-theme="light"] .theme-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

[data-theme="light"] .theme-toggle-btn:active {
  background: rgba(0, 0, 0, 0.11);
}

.theme-icon {
  font-size: 1.2rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-user-select: none;
  user-select: none;
}

.btn-scripts {
  width: 120px;
  height: 100%;
  padding: 0;
  margin: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-main);
  border: none;
  border-left: 1px solid var(--border-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 0.86rem;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
  -webkit-user-select: none;
  user-select: none;
  outline: none !important;
}

.btn-scripts:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--accent-cyan);
}

.btn-scripts.active {
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
}

[data-theme="light"] .btn-scripts:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--accent-cyan);
}

[data-theme="light"] .btn-scripts.active {
  background: rgba(2, 132, 199, 0.1);
  color: #0284c7;
}

.btn-scripts .icon {
  font-size: 1.05rem;
  line-height: 1;
}

.btn-add-project {
  width: 160px;
  height: 100%;
  padding: 0;
  margin: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-main);
  border: none;
  border-left: 1px solid var(--border-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
  -webkit-user-select: none;
  user-select: none;
  outline: none !important;
}

.btn-add-project:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--accent-cyan);
}

.btn-add-project:active {
  background: rgba(255, 255, 255, 0.14);
}

[data-theme="light"] .btn-add-project:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--accent-cyan);
}

[data-theme="light"] .btn-add-project:active {
  background: rgba(0, 0, 0, 0.11);
}

.btn-add-project .icon {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--accent-cyan);
  line-height: 1;
}
</style>
