<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { t } from '../locales.js';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  workspaceProjects: {
    type: Array,
    default: () => []
  },
  trackedProjectNames: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'select']);

const searchQuery = ref('');

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const trackedSet = new Set(props.trackedProjectNames);
  return props.workspaceProjects.filter(p => {
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q))) ||
      (p.tag && p.tag.toLowerCase().includes(q));
    return matchesSearch && !trackedSet.has(p.name);
  });
});

const closeModal = () => {
  searchQuery.value = '';
  emit('close');
};

const selectProject = (projectName) => {
  emit('select', projectName);
  closeModal();
};

const handleKeydown = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeModal();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="closeModal">
    <div class="modal-window glass-panel">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title-group">
          <span class="icon">📁</span>
          <h2 class="modal-title">{{ t('addProject.title') }}</h2>
        </div>
        <button class="btn-close" @click="closeModal">✕</button>
      </div>

      <!-- Search Box -->
      <div class="search-section">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('addProject.searchPlaceholder')"
          class="search-input"
          autofocus
        />
      </div>

      <!-- Projects List -->
      <div class="projects-list">
        <div v-if="filteredProjects.length === 0" class="empty-state">
          <span class="empty-icon">🔍</span>
          <p>{{ t('addProject.empty') }}</p>
        </div>
        <button
          v-for="proj in filteredProjects"
          :key="proj.name"
          class="project-item"
          @click="selectProject(proj.name)"
        >
          <div class="project-info">
            <span class="project-name">{{ proj.name }}</span>
            <div class="project-tags">
              <span
                v-for="tag in (Array.isArray(proj.tags) && proj.tags.length ? proj.tags : [proj.tag || 'General'])"
                :key="tag"
                class="project-tag"
              >
                {{ tag }}
              </span>
            </div>
          </div>
          <span class="btn-add-action">{{ t('addProject.add') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-window {
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-modal);
  border: 1px solid var(--border-subtle);
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card);
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.01em;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.btn-close:hover {
  background: var(--bg-card-active);
  color: var(--text-main);
}

.search-section {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-app);
}

.search-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 0.9rem;
  color: var(--text-main);
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: var(--accent-cyan);
}

.projects-list {
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 520px;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  text-align: left;
}

.project-item:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-focus);
  transform: translateX(2px);
}

.project-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
}

.project-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.project-tag {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
}

.btn-add-action {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent-cyan-border);
}

.empty-state {
  padding: 30px;
  text-align: center;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>
