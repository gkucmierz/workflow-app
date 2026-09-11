<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { t, currentLang } from '../locales.js';
import { getDeterministicHue } from '../colors.js';
import ProjectCard from '../components/ProjectCard.vue';
import { projects, fetchProjects } from '../store/projects.js';

const route = useRoute();
const router = useRouter();

const tasks = ref([]);
const filterMode = ref('all'); // 'all' | 'active' | 'done'

// Drag and drop states
const isBoardDraggingOver = ref(false);
const draggingOverTaskId = ref(null);
let boardDragCounter = 0;

// Selected project reactive to route
const selectedProject = computed(() => {
  return (route.params.project || '').toString();
});

// Initialize projects & default route
const initProjects = async () => {
  const data = await fetchProjects();
  if (!selectedProject.value && data.length > 0) {
    const saved = localStorage.getItem('workflow-selected-project');
    const validSaved = data.find(p => p.name === saved);
    const target = validSaved ? validSaved.name : data[0].name;
    router.replace(`/p/${target}`);
  } else if (selectedProject.value) {
    localStorage.setItem('workflow-selected-project', selectedProject.value);
  }
};

// Fetch tasks for active project
const fetchTasks = async (projectName) => {
  if (!projectName) return;
  try {
    const res = await fetch(`/api/projects/${projectName}/tasks`);
    tasks.value = await res.json();
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
  }
};

// Watch for project route param changes
watch(
  () => route.params.project,
  (newProj) => {
    if (newProj) {
      const projStr = newProj.toString();
      localStorage.setItem('workflow-selected-project', projStr);
      fetchProjects();
      fetchTasks(projStr);
    }
  },
  { immediate: true }
);

const selectProject = (name) => {
  if (name !== selectedProject.value) {
    router.push(`/p/${name}`);
  }
};

// Filtered tasks
const filteredTasks = computed(() => {
  if (filterMode.value === 'active') {
    return tasks.value.filter(t => !t.done);
  }
  if (filterMode.value === 'done') {
    return tasks.value.filter(t => t.done);
  }
  if (filterMode.value === 'common') {
    return tasks.value.filter(t => t.common_problem);
  }
  return tasks.value;
});

const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(currentLang.value === 'pl' ? 'pl-PL' : 'en-US', { hour: '2-digit', minute: '2-digit' });
};

// Quick toggle done directly on card
const toggleTaskDone = async (task) => {
  try {
    await fetch(`/api/projects/${selectedProject.value}/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !task.done })
    });
    task.done = !task.done;
    await fetchProjects();
  } catch (err) {
    console.error('Failed to toggle task:', err);
  }
};

// Navigation to Task Editor
const navigateToNewTask = () => {
  if (!selectedProject.value) return;
  router.push(`/p/${selectedProject.value}/tasks/new`);
};

const navigateToEditTask = (task) => {
  if (!selectedProject.value || !task?.id) return;
  router.push(`/p/${selectedProject.value}/tasks/${task.id}`);
};

// Drag & Drop onto Project Card or Board / Placeholder
const handleDroppedFilesForNewTask = async (projectName, files) => {
  if (!projectName || !files || files.length === 0) return;

  try {
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }
    const res = await fetch(`/api/projects/${projectName}/assets`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.files)) {
      // Store staged assets for new task view
      const stagedKey = `workflow_staged_assets_${projectName}`;
      let existingStaged = [];
      try {
        existingStaged = JSON.parse(sessionStorage.getItem(stagedKey) || '[]');
      } catch {}
      const combined = [...existingStaged, ...data.files];
      sessionStorage.setItem(stagedKey, JSON.stringify(combined));
    }
  } catch (err) {
    console.error('Failed to upload dropped assets:', err);
  }

  router.push(`/p/${projectName}/tasks/new`);
};

const onDropFilesOnProject = ({ project, files }) => {
  handleDroppedFilesForNewTask(project, files);
};

// Drag & Drop on Board Stream
const onBoardDragEnter = (e) => {
  e.preventDefault();
  if (selectedProject.value) {
    boardDragCounter++;
    isBoardDraggingOver.value = true;
  }
};

const onBoardDragOver = (e) => {
  e.preventDefault();
  if (selectedProject.value) {
    isBoardDraggingOver.value = true;
  }
};

const onBoardDragLeave = (e) => {
  e.preventDefault();
  if (selectedProject.value) {
    boardDragCounter--;
    if (boardDragCounter <= 0) {
      boardDragCounter = 0;
      isBoardDraggingOver.value = false;
    }
  }
};

const onBoardDrop = (e) => {
  e.preventDefault();
  boardDragCounter = 0;
  isBoardDraggingOver.value = false;
  draggingOverTaskId.value = null;
  if (!selectedProject.value) return;

  const rawFiles = Array.from(e.dataTransfer?.files || []);
  const imageFiles = rawFiles.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name));

  if (imageFiles.length > 0) {
    handleDroppedFilesForNewTask(selectedProject.value, imageFiles);
  }
};

// Drag & Drop on Placeholder Card
const onPlaceholderDragEnter = (e) => {
  e.preventDefault();
  e.stopPropagation();
  draggingOverTaskId.value = null;
  isBoardDraggingOver.value = true;
};

const onPlaceholderDragLeave = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

const onPlaceholderDrop = (e) => {
  e.preventDefault();
  e.stopPropagation();
  boardDragCounter = 0;
  isBoardDraggingOver.value = false;
  draggingOverTaskId.value = null;
  if (!selectedProject.value) return;

  const rawFiles = Array.from(e.dataTransfer?.files || []);
  const imageFiles = rawFiles.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name));

  if (imageFiles.length > 0) {
    handleDroppedFilesForNewTask(selectedProject.value, imageFiles);
  }
};

// Drag & Drop onto existing task card (attach directly)
const onTaskDragEnter = (taskId, e) => {
  e.preventDefault();
  e.stopPropagation();
  draggingOverTaskId.value = taskId;
};

const onTaskDragLeave = (taskId, e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!e.currentTarget.contains(e.relatedTarget)) {
    if (draggingOverTaskId.value === taskId) {
      draggingOverTaskId.value = null;
    }
  }
};

const onTaskDrop = async (task, e) => {
  e.preventDefault();
  e.stopPropagation();
  boardDragCounter = 0;
  draggingOverTaskId.value = null;
  isBoardDraggingOver.value = false;

  const rawFiles = Array.from(e.dataTransfer?.files || []);
  const imageFiles = rawFiles.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name));

  if (imageFiles.length > 0) {
    try {
      const formData = new FormData();
      for (const f of imageFiles) {
        formData.append('files', f);
      }
      const res = await fetch(`/api/projects/${selectedProject.value}/assets`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        const currentAssets = Array.isArray(task.assets) ? [...task.assets] : [];
        for (const uploaded of data.files) {
          if (!currentAssets.some(a => a.filename === uploaded.filename)) {
            currentAssets.push({
              filename: uploaded.filename,
              url: uploaded.url,
              annotations: []
            });
          }
        }

        await fetch(`/api/projects/${selectedProject.value}/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: currentAssets })
        });
        await fetchTasks(selectedProject.value);
        await fetchProjects();
      }
    } catch (err) {
      console.error('Failed to attach assets to task:', err);
    }
  }
};

onMounted(() => {
  initProjects();
});
</script>

<template>
  <main class="workspace-grid">
    <!-- LEFT COLUMN: PROJECTS DECK -->
    <section class="projects-sidebar">
      <div class="column-header">
        <div class="column-header-left">
          <h2 class="column-title">{{ t('projects.title') }}</h2>
          <span class="badge-count">{{ projects.length }}</span>
        </div>
      </div>

      <div v-if="projects.length === 0" class="empty-projects glass-card">
        <span class="empty-icon">📂</span>
        <p class="empty-text">{{ t('projects.empty') }}</p>
      </div>

      <div v-else class="projects-grid">
        <ProjectCard
          v-for="p in projects"
          :key="p.name"
          :project="p"
          :is-selected="selectedProject === p.name"
          @select="selectProject"
          @drop-files="onDropFilesOnProject"
        />
      </div>
    </section>

    <!-- RIGHT COLUMN: TASKS BOARD -->
    <section
      class="tasks-board"
      :class="{ 'is-drop-active': isBoardDraggingOver }"
      @dragenter="onBoardDragEnter"
      @dragover="onBoardDragOver"
      @dragleave="onBoardDragLeave"
      @drop="onBoardDrop"
    >
      <div class="column-header">
        <div class="column-header-left">
          <h2 class="column-title">{{ t('board.title') }}</h2>
          <span
            v-if="selectedProject"
            class="project-tag-pill"
            :class="{ 'is-workspace-global': selectedProject === '_workspace' }"
            :style="{ '--proj-hue': getDeterministicHue(selectedProject) }"
          >
            {{ selectedProject === '_workspace' ? '🌐 Workspace' : selectedProject }}
          </span>
          <span v-else class="badge-count">{{ t('board.noSelection') }}</span>
        </div>
      </div>

      <!-- No Project Selected State -->
      <div v-if="!selectedProject" class="no-selection glass-card">
        <span class="empty-icon">👈</span>
        <h3 class="no-sel-title">{{ t('board.noSelTitle') }}</h3>
        <p class="empty-text">{{ t('board.noSelDesc') }}</p>
      </div>

      <!-- Project Selected Board Content -->
      <div v-else class="project-board-content">
        <!-- Filter Controls Bar -->
        <div class="board-filter-bar glass-card">
          <div class="filter-group">
            <button
              class="filter-pill"
              :class="{ active: filterMode === 'all' }"
              @click="filterMode = 'all'"
            >
              {{ t('board.filterAll', { count: tasks.length }) }}
            </button>
            <button
              class="filter-pill"
              :class="{ active: filterMode === 'active' }"
              @click="filterMode = 'active'"
            >
              {{ t('board.filterActive', { count: tasks.filter(t => !t.done).length }) }}
            </button>
            <button
              class="filter-pill"
              :class="{ active: filterMode === 'done' }"
              @click="filterMode = 'done'"
            >
              {{ t('board.filterDone', { count: tasks.filter(t => t.done).length }) }}
            </button>
            <button
              class="filter-pill"
              :class="{ active: filterMode === 'common' }"
              @click="filterMode = 'common'"
            >
              {{ t('board.filterCommon', { count: tasks.filter(t => t.common_problem).length }) }}
            </button>
          </div>

          <div class="filter-bar-right">
            <button class="btn-new-task" @click="navigateToNewTask">
              <span class="btn-plus">+</span>
              <span>{{ t('board.newTask') }}</span>
            </button>
          </div>
        </div>

        <!-- Tasks Stream -->
        <div class="tasks-stream">
          <!-- Existing Task Cards -->
          <div
            v-for="task in filteredTasks"
            :key="task.id"
            class="task-card glass-card"
            :class="{
              'is-done': task.done,
              'is-drop-active': draggingOverTaskId === task.id
            }"
            @click="navigateToEditTask(task)"
            @dragenter="onTaskDragEnter(task.id, $event)"
            @dragover.prevent
            @dragleave="onTaskDragLeave(task.id, $event)"
            @drop="onTaskDrop(task, $event)"
          >
            <!-- Drop Overlay for Existing Task -->
            <div v-if="draggingOverTaskId === task.id" class="drop-overlay animate-pulse">
              <span class="empty-icon">📥</span>
              <p class="drop-text">{{ t('board.dropAttachTitle') }}</p>
            </div>

            <!-- Card Header with Unified Status Toggle Switch -->
            <div class="task-card-header" @click.stop>
              <div class="task-card-header-left">
                <span v-if="task.id" class="task-id-badge">#{{ task.id.replace(/^task_\d+_/, '') }}</span>
                <span v-if="task.common_problem" class="common-problem-badge">{{ t('board.commonBadge') }}</span>
                <span v-if="task.originProject" class="origin-project-badge">📂 {{ task.originProject }}</span>
                <button
                  class="status-toggle-btn"
                  :class="{ 'is-done': task.done }"
                  @click="toggleTaskDone(task)"
                >
                  <span class="toggle-switch-track">
                    <span class="toggle-switch-thumb"></span>
                  </span>
                  <span class="toggle-status-label">
                    {{ task.done ? t('board.statusCompleted') : t('board.statusInProgress') }}
                  </span>
                </button>
              </div>
              <span class="task-date">{{ formatDate(task.last_modified || task.timestamp) }}</span>
            </div>

            <!-- Task Body -->
            <p class="task-text">{{ task.task || t('board.noDescription') }}</p>

            <!-- Screenshots Thumbnails Strip -->
            <div v-if="task.assets && task.assets.length > 0" class="task-assets-strip">
              <div
                v-for="asset in task.assets"
                :key="asset.filename"
                class="asset-thumb-wrapper"
              >
                <img
                  :src="asset.url || `/data/${task.originProject || selectedProject}/assets/${asset.filename}`"
                  class="asset-thumb"
                  alt="Asset preview"
                />
                <span
                  v-if="asset.annotations && asset.annotations.length > 0"
                  class="asset-annotation-count"
                >
                  🎯 {{ asset.annotations.length }}
                </span>
              </div>
            </div>

            <!-- AI Agent Answer Preview Card -->
            <div v-if="task.answer" class="ai-answer-card">
              <div class="ai-answer-header">
                <span class="ai-icon">🤖</span>
                <span class="ai-label">{{ t('board.aiSolutionLabel') }}</span>
              </div>
              <p class="ai-answer-text">{{ task.answer }}</p>
            </div>
          </div>

          <!-- PERMANENT 1 PLACEHOLDER TASK CARD (Always rendered at the bottom) -->
          <div
            class="task-card-placeholder glass-card"
            :class="{ 'is-drop-active': isBoardDraggingOver && !draggingOverTaskId }"
            @click="navigateToNewTask"
            @dragenter="onPlaceholderDragEnter"
            @dragover.prevent
            @dragleave="onPlaceholderDragLeave"
            @drop="onPlaceholderDrop"
          >
            <!-- Smooth mathematically even rounded SVG dashed border -->
            <svg class="placeholder-border-svg" width="100%" height="100%">
              <rect
                x="1.5"
                y="1.5"
                width="calc(100% - 3px)"
                height="calc(100% - 3px)"
                rx="10"
                ry="10"
                fill="none"
                class="placeholder-rect"
              />
            </svg>

            <div class="placeholder-card-body">
              <div class="placeholder-icon-circle">
                <span class="plus-icon">+</span>
              </div>
              <div class="placeholder-text-group">
                <h4 class="placeholder-title">{{ t('board.placeholderNewTask') }}</h4>
                <p class="placeholder-hint">{{ t('board.placeholderHint') }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* WORKSPACE GRID */
.workspace-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
  min-height: 0;
}

/* LEFT SIDEBAR: PROJECTS */
.projects-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

/* UNIFIED COLUMN HEADERS */
.column-header {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  flex-shrink: 0;
}

.column-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.column-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.badge-count {
  font-size: 0.74rem;
  font-family: var(--font-mono);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--bg-card-active);
  color: var(--text-dim);
  border: 1px solid var(--border-subtle);
}

/* Badge with smooth theme transition (Zero-Blink) */
.project-tag-pill {
  font-size: 0.74rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 3px 9px;
  border-radius: var(--radius-sm);
  background: hsla(var(--proj-hue, 208), 50%, 55%, 0.18);
  color: hsl(var(--proj-hue, 208), 85%, 82%);
  border: 1px solid hsla(var(--proj-hue, 208), 50%, 65%, 0.35);
  transition: var(--theme-transition);
}

[data-theme="light"] .project-tag-pill {
  background: hsla(var(--proj-hue, 208), 70%, 86%, 0.9);
  color: hsl(var(--proj-hue, 208), 80%, 25%);
  border: 1px solid hsla(var(--proj-hue, 208), 60%, 74%, 0.85);
}

.projects-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 4px;
}

.empty-projects {
  padding: 40px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon {
  font-size: 2rem;
}

.empty-text {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* RIGHT COLUMN: TASKS BOARD */
.tasks-board {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  transition: var(--theme-transition);
}

.tasks-board.is-drop-active {
  border-radius: var(--radius-lg);
  box-shadow: 0 0 25px var(--accent-cyan-border);
}

.no-selection {
  padding: 40px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.no-sel-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
}

.project-board-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

/* FILTER BAR */
.board-filter-bar {
  height: 54px;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  -webkit-user-select: none;
  user-select: none;
}

.filter-group {
  height: 100%;
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  -webkit-user-select: none;
  user-select: none;
}

.filter-pill {
  height: 100%;
  margin: 0;
  padding: 0 22px;
  border: none;
  border-right: 1px solid var(--border-subtle);
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
  box-shadow: none;
  -webkit-user-select: none;
  user-select: none;
}

.filter-pill:hover:not(.active) {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-main);
}

[data-theme="light"] .filter-pill:hover:not(.active) {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-main);
}

.filter-pill.active {
  background: var(--bg-card-active);
  color: var(--accent-cyan);
  font-weight: 700;
  box-shadow: inset 0 -2px 0 var(--accent-cyan);
}

[data-theme="light"] .filter-pill.active {
  background: #ffffff;
  color: var(--accent-cyan);
  box-shadow: inset 0 -2px 0 var(--accent-cyan);
}

.filter-bar-right {
  height: 100%;
  margin-left: auto;
  display: flex;
  align-items: stretch;
  padding: 0;
  margin: 0;
  -webkit-user-select: none;
  user-select: none;
}

.btn-new-task {
  height: 100%;
  padding: 0 22px;
  margin: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-main);
  border: none;
  border-left: 1px solid var(--border-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  transition: background 0.15s ease, color 0.15s ease;
  -webkit-user-select: none;
  user-select: none;
  outline: none !important;
}

.btn-new-task:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--accent-cyan);
}

.btn-new-task:active {
  background: rgba(255, 255, 255, 0.14);
}

[data-theme="light"] .btn-new-task:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--accent-cyan);
}

[data-theme="light"] .btn-new-task:active {
  background: rgba(0, 0, 0, 0.11);
}

.btn-plus {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--accent-cyan);
  line-height: 1;
}

/* TASKS STREAM */
.tasks-stream {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
}

/* TASK CARD */
.task-card {
  position: relative;
  padding: 16px;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  border-left: 3px solid var(--accent-amber);
  overflow: hidden;
  transition: var(--theme-transition), transform 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.task-card.is-done {
  border-left-color: var(--accent-green);
  opacity: 0.85;
}

.task-card.is-drop-active {
  border: 2px dashed var(--accent-cyan) !important;
  background: var(--accent-cyan-bg) !important;
  transform: scale(1.01);
}

.task-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.task-card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-id-badge {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
  border: 1px solid var(--accent-cyan-border);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  -webkit-user-select: none;
  user-select: none;
}

.common-problem-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  -webkit-user-select: none;
  user-select: none;
  white-space: nowrap;
}

.origin-project-badge {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  -webkit-user-select: none;
  user-select: none;
  white-space: nowrap;
}

.task-date {
  font-size: 0.74rem;
  font-family: var(--font-mono);
  color: var(--text-dim);
  margin-left: auto;
}

.task-text {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-main);
  white-space: pre-wrap;
  flex: 1;
}

.task-assets-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.asset-thumb-wrapper {
  position: relative;
  width: 90px;
  height: 60px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card-active);
  flex-shrink: 0;
}

.asset-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-annotation-count {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.8);
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--accent-cyan);
}

.ai-answer-card {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.22);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-answer-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-icon {
  font-size: 0.9rem;
}

.ai-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-green);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-answer-text {
  font-size: 0.86rem;
  color: var(--text-main);
  line-height: 1.4;
  white-space: pre-wrap;
}

/* PERMANENT 1 PLACEHOLDER TASK CARD */
.task-card-placeholder {
  position: relative;
  min-height: 140px;
  padding: 24px 20px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--theme-transition), background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
}

/* Elegant left cyan accent bar (matching regular task-card solid left bar) */
.task-card-placeholder::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-cyan);
  border-top-left-radius: var(--radius-md);
  border-bottom-left-radius: var(--radius-md);
  z-index: 2;
  transition: background 0.15s ease;
}

/* Beautiful mathematically even SVG dashed border (Zero-Jaggies) */
.placeholder-border-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.placeholder-rect {
  stroke: var(--border-subtle);
  stroke-width: 1.5px;
  stroke-dasharray: 8 6;
  stroke-linecap: round;
  transition: stroke 0.15s ease, stroke-width 0.15s ease;
}

[data-theme="light"] .placeholder-rect {
  stroke: rgba(0, 0, 0, 0.14);
}

.task-card-placeholder:hover {
  background: var(--bg-card-hover);
  transform: translateY(-1px);
}

.task-card-placeholder:hover .placeholder-rect {
  stroke: var(--accent-cyan);
  stroke-width: 1.5px;
}

.task-card-placeholder.is-drop-active {
  background: var(--accent-cyan-bg) !important;
  box-shadow: 0 0 25px var(--accent-cyan-border);
  transform: scale(1.01);
}

.task-card-placeholder.is-drop-active .placeholder-rect {
  stroke: var(--accent-cyan) !important;
  stroke-width: 2px;
  stroke-dasharray: 7 5;
}

.placeholder-card-body {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 16px;
}

.placeholder-icon-circle {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-full);
  background: var(--accent-cyan-bg);
  border: 1px solid var(--accent-cyan-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.task-card-placeholder:hover .placeholder-icon-circle {
  transform: scale(1.08);
}

.plus-icon {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent-cyan);
  line-height: 1;
}

.placeholder-text-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.placeholder-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.placeholder-hint {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
}

/* DROP OVERLAY */
.drop-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  z-index: 10;
  border-radius: var(--radius-lg);
  color: var(--accent-cyan);
  padding: 24px;
  pointer-events: none;
  box-sizing: border-box;
}
</style>
