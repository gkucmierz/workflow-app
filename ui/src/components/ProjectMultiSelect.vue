<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { t } from '../locales.js';
import { getDeterministicHue } from '../colors.js';

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  projects: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const containerRef = ref(null);

const projectNames = computed(() => {
  return props.projects.map(p => (typeof p === 'string' ? p : p.name));
});

const isAllSelected = computed(() => {
  if (projectNames.value.length === 0) return false;
  return projectNames.value.length === props.modelValue.length;
});

const summaryText = computed(() => {
  const total = projectNames.value.length;
  const count = props.modelValue.length;

  if (count === 0 || count === total) {
    return t('multiselect.allProjects', { count: total });
  }
  return t('multiselect.selectedCount', { count, total });
});

const isSelected = (name) => {
  return props.modelValue.includes(name);
};

const toggleProject = (name) => {
  let next;
  if (isSelected(name)) {
    next = props.modelValue.filter(p => p !== name);
  } else {
    next = [...props.modelValue, name];
  }
  emit('update:modelValue', next);
};

const selectAll = () => {
  emit('update:modelValue', [...projectNames.value]);
};

const deselectAll = () => {
  emit('update:modelValue', []);
};

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const closeDropdown = () => {
  isOpen.value = false;
};

// Click outside handler
const handleClickOutside = (e) => {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    closeDropdown();
  }
};

// ESC key listener (Rule 6.1)
const handleKeydown = (e) => {
  if (e.key === 'Escape' && isOpen.value) {
    e.preventDefault();
    e.stopPropagation();
    closeDropdown();
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div ref="containerRef" class="multiselect-container">
    <!-- Trigger Button -->
    <button
      type="button"
      class="multiselect-trigger"
      :class="{ active: isOpen, 'has-filter': modelValue.length > 0 && !isAllSelected }"
      @click="toggleDropdown"
    >
      <span class="trigger-icon">📁</span>
      <span class="trigger-label">{{ summaryText }}</span>
      <span v-if="modelValue.length > 0 && !isAllSelected" class="selection-badge">
        {{ modelValue.length }}
      </span>
      <span class="chevron" :class="{ open: isOpen }">▼</span>
    </button>

    <!-- Dropdown Menu -->
    <div v-if="isOpen" class="multiselect-dropdown glass-panel">
      <!-- Actions Bar (Select / Deselect All) -->
      <div class="dropdown-actions">
        <button
          type="button"
          class="btn-action-text"
          :disabled="isAllSelected"
          @click="selectAll"
        >
          {{ t('multiselect.selectAll') }}
        </button>
        <span class="action-divider">|</span>
        <button
          type="button"
          class="btn-action-text"
          :disabled="modelValue.length === 0"
          @click="deselectAll"
        >
          {{ t('multiselect.deselectAll') }}
        </button>
        <span class="count-indicator">
          {{ modelValue.length }} / {{ projectNames.length }}
        </span>
      </div>

      <!-- Projects List -->
      <div class="projects-list-scroll">
        <div
          v-for="name in projectNames"
          :key="name"
          class="project-option-row"
          :class="{ selected: isSelected(name) }"
          @click="toggleProject(name)"
        >
          <!-- Custom Checkbox -->
          <div class="custom-checkbox" :class="{ checked: isSelected(name) }">
            <span v-if="isSelected(name)" class="checkmark">✓</span>
          </div>

          <!-- Color Dot -->
          <span
            class="project-dot"
            :style="{ backgroundColor: `hsl(${getDeterministicHue(name)}, 75%, 60%)` }"
          ></span>

          <!-- Name -->
          <span class="project-name">{{ name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.multiselect-container {
  position: relative;
  display: inline-block;
  -webkit-user-select: none;
  user-select: none;
}

.multiselect-trigger {
  height: 36px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  font-weight: 600;
  transition: all 0.15s ease;
  outline: none !important;
  -webkit-user-select: none;
  user-select: none;
}

.multiselect-trigger:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-cyan-border);
}

.multiselect-trigger.active {
  border-color: var(--accent-cyan);
  background: var(--bg-card-active);
}

.multiselect-trigger.has-filter {
  border-color: var(--accent-cyan);
}

.trigger-icon {
  font-size: 0.95rem;
  line-height: 1;
}

.trigger-label {
  white-space: nowrap;
}

.selection-badge {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  font-weight: 800;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
}

.chevron {
  font-size: 0.65rem;
  color: var(--text-muted);
  transition: transform 0.2s ease;
  margin-left: 2px;
}

.chevron.open {
  transform: rotate(180deg);
}

/* DROPDOWN PANEL */
.multiselect-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 290px;
  max-width: 360px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-modal);
  z-index: 150;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: dropdownPop 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dropdownPop {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-actions {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-subtle);
  gap: 8px;
  font-size: 0.76rem;
}

.btn-action-text {
  background: transparent;
  border: none;
  color: var(--accent-cyan);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: opacity 0.15s ease, background 0.15s ease;
  outline: none !important;
}

.btn-action-text:hover:not(:disabled) {
  background: var(--accent-cyan-bg);
}

.btn-action-text:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-divider {
  color: var(--border-subtle);
  font-weight: 300;
}

.count-indicator {
  margin-left: auto;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* LIST OF PROJECTS */
.projects-list-scroll {
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-option-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s ease;
}

.project-option-row:hover {
  background: var(--bg-card-hover);
}

.project-option-row.selected {
  background: var(--accent-cyan-bg);
}

[data-theme="light"] .project-option-row.selected {
  background: rgba(2, 132, 199, 0.08);
}

/* CUSTOM CHECKBOX */
.custom-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.12s ease;
}

.custom-checkbox.checked {
  background: var(--accent-cyan);
  border-color: var(--accent-cyan);
  color: #071324;
}

[data-theme="light"] .custom-checkbox.checked {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}

.checkmark {
  font-size: 0.7rem;
  font-weight: 900;
  line-height: 1;
}

.project-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.project-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
