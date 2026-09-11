<script setup>
import { ref, computed } from 'vue';
import { t } from '../locales.js';
import { getDeterministicHue } from '../colors.js';

const props = defineProps({
  project: {
    type: Object,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select', 'drop-files']);

const isDraggingOver = ref(false);
const hue = computed(() => getDeterministicHue(props.project.name));

const onDragEnter = (e) => {
  e.preventDefault();
  isDraggingOver.value = true;
};

const onDragOver = (e) => {
  e.preventDefault();
  isDraggingOver.value = true;
};

const onDragLeave = (e) => {
  e.preventDefault();
  isDraggingOver.value = false;
};

const onDrop = (e) => {
  e.preventDefault();
  isDraggingOver.value = false;
  const rawFiles = Array.from(e.dataTransfer?.files || []);
  const files = rawFiles.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name));
  if (files.length > 0) {
    emit('drop-files', {
      project: props.project.name,
      files
    });
  }
};
</script>

<template>
  <div
    class="project-card glass-card"
    :class="{
      'is-selected': isSelected,
      'is-drop-active': isDraggingOver
    }"
    :style="{ '--proj-hue': hue }"
    @click="emit('select', project.name)"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drop Overlay Cue -->
    <div v-if="isDraggingOver" class="drop-overlay animate-pulse">
      <span class="drop-icon">📥</span>
      <span class="drop-text">{{ t('projects.dropHint') }}</span>
    </div>

    <!-- Header -->
    <div class="card-header">
      <div class="title-group">
        <span class="folder-icon">📂</span>
        <h3 class="project-title">{{ project.name }}</h3>
      </div>
      <div v-if="(project.tags && project.tags.length) || project.tag" class="tag-group">
        <span
          v-for="tag in (project.tags && project.tags.length ? project.tags : [project.tag])"
          :key="tag"
          class="tag-badge"
        >
          {{ tag }}
        </span>
      </div>
    </div>

    <!-- Metrics -->
    <div class="card-metrics">
      <div class="metric-pill active" :class="{ empty: (project.activeTasks || 0) === 0 }">
        <span class="dot"></span>
        <span>{{ t('projects.activeTasks', { count: project.activeTasks || 0 }) }}</span>
      </div>

      <div class="metric-pill done" :class="{ empty: (project.doneTasks || 0) === 0 }">
        <span>{{ t('projects.doneTasks', { count: project.doneTasks || 0 }) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-card {
  position: relative;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  flex-shrink: 0;
  background: linear-gradient(145deg, hsla(var(--proj-hue, 208), 50%, 35%, 0.18) 0%, hsla(var(--proj-hue, 208), 45%, 20%, 0.08) 100%);
  border: 1px solid hsla(var(--proj-hue, 208), 50%, 60%, 0.22);
  border-radius: var(--radius-md);
  transition: var(--theme-transition), transform 0.15s ease, box-shadow 0.15s ease;
  overflow: hidden;
}

.project-card:hover {
  border-color: hsla(var(--proj-hue, 208), 65%, 65%, 0.45);
  background: linear-gradient(145deg, hsla(var(--proj-hue, 208), 55%, 40%, 0.24) 0%, hsla(var(--proj-hue, 208), 45%, 25%, 0.12) 100%);
  box-shadow: var(--shadow-card);
}

.project-card.is-selected {
  border-color: hsl(var(--proj-hue, 208), 85%, 68%);
  background: linear-gradient(145deg, hsla(var(--proj-hue, 208), 60%, 45%, 0.28) 0%, hsla(var(--proj-hue, 208), 50%, 30%, 0.16) 100%);
  box-shadow: 0 0 20px hsla(var(--proj-hue, 208), 70%, 60%, 0.35);
}

.project-card.is-drop-active {
  border: 2px dashed hsl(var(--proj-hue, 208), 85%, 68%) !important;
  background: hsla(var(--proj-hue, 208), 60%, 50%, 0.28) !important;
}

[data-theme="light"] .project-card {
  background: linear-gradient(145deg, hsla(var(--proj-hue, 208), 35%, 98%, 0.9) 0%, hsla(var(--proj-hue, 208), 25%, 95%, 0.7) 100%);
  border: 1px solid hsla(var(--proj-hue, 208), 30%, 86%, 0.75);
}

[data-theme="light"] .project-card:hover {
  background: linear-gradient(145deg, hsla(var(--proj-hue, 208), 45%, 98%, 0.96) 0%, hsla(var(--proj-hue, 208), 35%, 94%, 0.85) 100%);
  border-color: hsla(var(--proj-hue, 208), 45%, 78%, 0.9);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

[data-theme="light"] .project-card.is-selected {
  background: linear-gradient(145deg, hsla(var(--proj-hue, 208), 85%, 95%, 0.98) 0%, hsla(var(--proj-hue, 208), 70%, 89%, 0.92) 100%);
  border: 1.5px solid hsl(var(--proj-hue, 208), 70%, 55%);
  box-shadow: 0 4px 14px hsla(var(--proj-hue, 208), 60%, 45%, 0.18);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 10;
  border-radius: var(--radius-md);
  color: var(--accent-cyan);
  font-weight: 700;
  font-size: 0.92rem;
  pointer-events: none;
}

.drop-icon {
  font-size: 1.8rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.folder-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.project-title {
  font-size: 0.96rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

[data-theme="light"] .project-card .project-title {
  color: var(--text-main);
}

[data-theme="light"] .project-card.is-selected .project-title {
  color: hsl(var(--proj-hue, 208), 85%, 22%);
}

.tag-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tag-badge {
  font-size: 0.68rem;
  font-family: var(--font-mono);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: hsla(var(--proj-hue, 208), 50%, 55%, 0.18);
  color: hsl(var(--proj-hue, 208), 80%, 82%);
  border: 1px solid hsla(var(--proj-hue, 208), 50%, 65%, 0.3);
  flex-shrink: 0;
}

[data-theme="light"] .project-card .tag-badge {
  background: hsla(var(--proj-hue, 208), 70%, 86%, 0.9);
  border: 1px solid hsla(var(--proj-hue, 208), 60%, 74%, 0.85);
  color: hsl(var(--proj-hue, 208), 80%, 25%);
}

.card-metrics {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.metric-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  letter-spacing: 0.01em;
  transition: var(--theme-transition);
}

/* Active tasks > 0 */
.metric-pill.active {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(245, 158, 11, 0.08) 100%);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.38);
}

.metric-pill.active .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.8);
}

[data-theme="light"] .metric-pill.active {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: #92400e;
  border: 1px solid rgba(245, 158, 11, 0.45);
}

[data-theme="light"] .metric-pill.active .dot {
  background: #d97706;
  box-shadow: 0 0 4px rgba(217, 119, 6, 0.4);
}

/* Active tasks == 0 */
.metric-pill.active.empty {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.metric-pill.active.empty .dot {
  background: #94a3b8;
  box-shadow: none;
}

[data-theme="light"] .metric-pill.active.empty {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(241, 245, 249, 0.8) 100%);
  color: hsl(var(--proj-hue, 208), 70%, 25%);
  border: 1px solid hsla(var(--proj-hue, 208), 50%, 75%, 0.7);
}

[data-theme="light"] .metric-pill.active.empty .dot {
  background: hsl(var(--proj-hue, 208), 65%, 45%);
}

/* Done tasks > 0 */
.metric-pill.done {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(16, 185, 129, 0.08) 100%);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.38);
}

[data-theme="light"] .metric-pill.done {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
  border: 1px solid rgba(16, 185, 129, 0.45);
}

/* Done tasks == 0 */
.metric-pill.done.empty {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

[data-theme="light"] .metric-pill.done.empty {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(241, 245, 249, 0.8) 100%);
  color: hsl(var(--proj-hue, 208), 70%, 25%);
  border: 1px solid hsla(var(--proj-hue, 208), 50%, 75%, 0.7);
}
</style>
