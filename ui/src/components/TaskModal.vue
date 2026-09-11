<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { t } from '../locales.js';
import ImageAnnotatorModal from './ImageAnnotatorModal.vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  project: {
    type: String,
    default: ''
  },
  taskData: {
    type: Object,
    default: null
  },
  initialFiles: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'saved', 'deleted']);

const taskText = ref('');
const assets = ref([]);
const answerText = ref('');
const isDone = ref(false);
const isUploading = ref(false);

const isAnnotatorOpen = ref(false);
const annotatingAsset = ref(null);

const isEditing = computed(() => Boolean(props.taskData && props.taskData.id));

// Local & Session Storage draft handling
const getStorageKey = () => {
  if (isEditing.value && props.taskData?.id) {
    return `workflow_draft_edit_${props.project}_${props.taskData.id}`;
  }
  return `workflow_draft_new_${props.project || 'default'}`;
};

const hasSavedDraft = ref(false);

const saveDraft = (text) => {
  const key = getStorageKey();
  if (!key) return;
  if (text && text.trim().length > 0) {
    try {
      sessionStorage.setItem(key, text);
      localStorage.setItem(key, text);
      hasSavedDraft.value = true;
    } catch (e) {
      console.warn('Failed to save draft:', e);
    }
  } else {
    clearDraft();
  }
};

const loadDraft = () => {
  const key = getStorageKey();
  if (!key) return null;
  try {
    const val = sessionStorage.getItem(key) || localStorage.getItem(key);
    hasSavedDraft.value = Boolean(val && val.trim().length > 0);
    return val;
  } catch (e) {
    return null;
  }
};

const clearDraft = () => {
  const key = getStorageKey();
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch (e) {}
  hasSavedDraft.value = false;
};

const clearDraftManual = () => {
  taskText.value = '';
  clearDraft();
};

watch(taskText, (newVal) => {
  if (props.isOpen) {
    saveDraft(newVal);
  }
});

// Initialize form
watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      if (props.taskData) {
        const savedDraft = loadDraft();
        taskText.value = (savedDraft !== null && savedDraft !== undefined && savedDraft.trim().length > 0)
          ? savedDraft
          : (props.taskData.task || '');
        assets.value = JSON.parse(JSON.stringify(props.taskData.assets || []));
        answerText.value = props.taskData.answer || '';
        isDone.value = Boolean(props.taskData.done);

        // If files were dropped onto an existing task card:
        if (props.initialFiles && props.initialFiles.length > 0) {
          await uploadFiles(props.initialFiles);
        }
      } else {
        const savedDraft = loadDraft();
        taskText.value = savedDraft || '';
        assets.value = [];
        answerText.value = '';
        isDone.value = false;

        // If files were dropped onto the project card or board
        if (props.initialFiles && props.initialFiles.length > 0) {
          await uploadFiles(props.initialFiles);
        }
      }
    }
  },
  { immediate: true }
);

// File Uploads
const uploadFiles = async (files) => {
  if (!files || files.length === 0 || !props.project) return;
  isUploading.value = true;

  try {
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }

    const res = await fetch(`/api/projects/${props.project}/assets`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success && Array.isArray(data.files)) {
      for (const uploaded of data.files) {
        assets.value.push({
          filename: uploaded.filename,
          url: uploaded.url,
          annotations: []
        });
      }
    }
  } catch (err) {
    console.error('Failed to upload screenshots:', err);
  } finally {
    isUploading.value = false;
  }
};

const onFileInputChange = (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    uploadFiles(files);
  }
};

const isDropZoneDragging = ref(false);
const isModalDragging = ref(false);

const onDropZoneDragEnter = (e) => {
  e.preventDefault();
  e.stopPropagation();
  isDropZoneDragging.value = true;
};

const onDropZoneDragOver = (e) => {
  e.preventDefault();
  e.stopPropagation();
  isDropZoneDragging.value = true;
};

const onDropZoneDragLeave = (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!e.currentTarget.contains(e.relatedTarget)) {
    isDropZoneDragging.value = false;
  }
};

const onDropZone = (e) => {
  e.preventDefault();
  e.stopPropagation();
  isDropZoneDragging.value = false;
  isModalDragging.value = false;
  const rawFiles = Array.from(e.dataTransfer?.files || []);
  const files = rawFiles.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name));
  if (files.length > 0) {
    uploadFiles(files);
  }
};

const onModalDragEnter = (e) => {
  e.preventDefault();
  isModalDragging.value = true;
};

const onModalDragOver = (e) => {
  e.preventDefault();
  isModalDragging.value = true;
};

const onModalDragLeave = (e) => {
  e.preventDefault();
  if (!e.currentTarget.contains(e.relatedTarget)) {
    isModalDragging.value = false;
  }
};

const onModalDrop = (e) => {
  e.preventDefault();
  isModalDragging.value = false;
  isDropZoneDragging.value = false;
  const rawFiles = Array.from(e.dataTransfer?.files || []);
  const files = rawFiles.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name));
  if (files.length > 0) {
    uploadFiles(files);
  }
};

const removeAsset = (idx) => {
  assets.value.splice(idx, 1);
};

const openAnnotator = (asset) => {
  annotatingAsset.value = asset;
  isAnnotatorOpen.value = true;
};

const onAnnotationSaved = ({ filename, annotations: newAnns }) => {
  const target = assets.value.find(a => a.filename === filename);
  if (target) {
    target.annotations = newAnns;
  }
};

const saveTask = async () => {
  if (!taskText.value.trim() && assets.value.length === 0) return;

  const payload = {
    task: taskText.value.trim(),
    assets: assets.value,
    answer: answerText.value.trim(),
    done: isDone.value
  };

  try {
    if (isEditing.value) {
      const res = await fetch(`/api/projects/${props.project}/tasks/${props.taskData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      emit('saved', data);
    } else {
      const res = await fetch(`/api/projects/${props.project}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      emit('saved', data);
    }
    clearDraft();
    closeModal();
  } catch (err) {
    console.error('Failed to save task:', err);
  }
};

const deleteTask = async () => {
  if (!isEditing.value) return;
  if (!confirm(t('taskModal.deleteConfirm'))) return;

  try {
    await fetch(`/api/projects/${props.project}/tasks/${props.taskData.id}`, {
      method: 'DELETE'
    });
    clearDraft();
    emit('deleted', props.taskData.id);
    closeModal();
  } catch (err) {
    console.error('Failed to delete task:', err);
  }
};

const closeModal = () => {
  emit('close');
};

const handleKeydown = (e) => {
  if (e.key === 'Escape' && props.isOpen && !isAnnotatorOpen.value) {
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
  <div
    v-if="isOpen"
    class="modal-backdrop"
    @click.self="closeModal"
    @dragenter="onModalDragEnter"
    @dragover.prevent="onModalDragOver"
    @dragleave="onModalDragLeave"
    @drop="onModalDrop"
  >
    <div
      class="task-modal-window glass-panel"
      @dragenter="onModalDragEnter"
      @dragover.prevent="onModalDragOver"
      @dragleave="onModalDragLeave"
      @drop="onModalDrop"
    >
      <!-- Header -->
      <div class="modal-header">
        <div class="header-left">
          <span class="project-badge">{{ project }}</span>
          <h2 class="modal-title">
            {{ isEditing ? t('taskModal.detailsTitle') : t('taskModal.newTitle') }}
          </h2>
        </div>
        <div class="header-right">
          <button
            class="status-toggle-btn"
            :class="{ 'is-done': isDone }"
            @click="isDone = !isDone"
          >
            <span class="toggle-switch-track">
              <span class="toggle-switch-thumb"></span>
            </span>
            <span class="toggle-status-label">
              {{ isDone ? t('taskModal.statusDone') : t('taskModal.statusPending') }}
            </span>
          </button>
          <button class="btn-close" @click="closeModal">✕</button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <!-- Task Description Input -->
        <div class="form-section">
          <div class="section-header">
            <label class="form-label">{{ t('taskModal.taskDescLabel') }}</label>
            <div v-if="hasSavedDraft" class="draft-indicator-group">
              <span class="draft-badge">
                <span class="draft-dot"></span>
                <span>{{ t('taskModal.draftSaved') }}</span>
              </span>
              <button
                v-if="!isEditing"
                type="button"
                class="btn-clear-draft"
                @click="clearDraftManual"
              >
                {{ t('taskModal.clearDraft') }}
              </button>
            </div>
          </div>
          <textarea
            v-model="taskText"
            :placeholder="t('taskModal.taskDescPlaceholder')"
            class="task-textarea"
            rows="6"
          ></textarea>
        </div>

        <!-- Screenshots & Assets Gallery -->
        <div class="form-section">
          <div class="section-header">
            <label class="form-label">{{ t('taskModal.assetsLabel', { count: assets.length }) }}</label>
            <label class="btn-attach">
              {{ t('taskModal.addScreenshot') }}
              <input type="file" multiple accept="image/*" class="hidden-input" @change="onFileInputChange" />
            </label>
          </div>

          <!-- Dropzone -->
          <div
            class="assets-dropzone"
            :class="{
              'is-uploading': isUploading,
              'is-drop-active': isDropZoneDragging || isModalDragging
            }"
            @dragenter.stop.prevent="onDropZoneDragEnter"
            @dragover.stop.prevent="onDropZoneDragOver"
            @dragleave.stop.prevent="onDropZoneDragLeave"
            @drop.stop="onDropZone"
          >
            <!-- Drag & Drop Active Overlay -->
            <div v-if="isDropZoneDragging || isModalDragging" class="drop-overlay animate-pulse">
              <div class="drop-icon-circle">
                <span class="empty-icon">📥</span>
              </div>
              <p class="drop-title">{{ t('taskModal.dropOverlayTitle') }}</p>
              <p class="drop-subtitle">{{ t('taskModal.dropOverlaySubtitle') }}</p>
            </div>

            <!-- Empty Dropzone Hint -->
            <div v-else-if="assets.length === 0" class="dropzone-hint">
              <div class="empty-icon-circle">
                <span class="hint-icon">🖼️</span>
              </div>
              <p class="hint-title">{{ t('taskModal.dropzoneTitle') }}</p>
              <p class="hint-sub">{{ t('taskModal.dropzoneSubtitle') }}</p>
            </div>

            <!-- Assets Grid -->
            <div v-else class="assets-grid">
              <div v-for="(asset, idx) in assets" :key="asset.filename" class="asset-card glass-card">
                <div class="asset-preview-container">
                  <img
                    :src="asset.url || `/data/${project}/assets/${asset.filename}`"
                    class="asset-img"
                    alt="Screenshot"
                  />
                  <!-- Vector Annotations Indicator -->
                  <div v-if="asset.annotations && asset.annotations.length > 0" class="vector-badge">
                    {{ t('taskModal.vectorCount', { count: asset.annotations.length }) }}
                  </div>
                </div>

                <div class="asset-actions">
                  <button class="btn-annotate" @click="openAnnotator(asset)">
                    {{ t('taskModal.annotateBtn') }}
                  </button>
                  <button class="btn-delete-asset" @click="removeAsset(idx)">
                    🗑️
                  </button>
                </div>
              </div>

              <!-- Add/Drop Tile inside Grid -->
              <label class="asset-card add-asset-tile">
                <span class="tile-icon">➕</span>
                <span class="tile-title">{{ t('taskModal.addTileTitle') }}</span>
                <span class="tile-sub">{{ t('taskModal.addTileSubtitle') }}</span>
                <input type="file" multiple accept="image/*" class="hidden-input" @change="onFileInputChange" />
              </label>
            </div>
          </div>
        </div>

        <!-- AI Agent Resolution Section -->
        <div class="form-section ai-section glass-card">
          <div class="ai-header">
            <span class="ai-title">{{ t('taskModal.aiHeader') }}</span>
            <span v-if="answerText" class="ai-status-pill">{{ t('taskModal.aiStatusFilled') }}</span>
            <span v-else class="ai-status-pill pending">{{ t('taskModal.aiStatusPending') }}</span>
          </div>
          <textarea
            v-model="answerText"
            :placeholder="t('taskModal.aiPlaceholder')"
            class="ai-textarea"
            rows="3"
          ></textarea>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="modal-footer">
        <button v-if="isEditing" class="btn-danger-delete" @click="deleteTask">
          {{ t('taskModal.deleteBtn') }}
        </button>
        <div class="footer-spacer"></div>
        <button class="btn-secondary" @click="closeModal">{{ t('taskModal.cancelBtn') }}</button>
        <button class="btn-primary-save" @click="saveTask">
          {{ isEditing ? t('taskModal.saveBtn') : t('taskModal.createBtn') }}
        </button>
      </div>
    </div>

    <!-- Image Annotator Overlay -->
    <ImageAnnotatorModal
      :is-open="isAnnotatorOpen"
      :asset="annotatingAsset"
      :project="project"
      @close="isAnnotatorOpen = false"
      @save="onAnnotationSaved"
    />
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.task-modal-window {
  width: 100%;
  max-width: 780px;
  max-height: 88vh;
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

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-badge {
  font-size: 0.76rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}



.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.btn-close:hover {
  background: var(--bg-card-active);
  color: var(--text-main);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.btn-attach {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid var(--accent-cyan-border);
  transition: all 0.15s ease;
}

.btn-attach:hover {
  background: var(--border-focus);
}

.hidden-input {
  display: none;
}

.task-textarea {
  width: 100%;
  min-height: 160px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-main);
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.task-textarea:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px var(--accent-cyan-bg);
}

.draft-indicator-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.draft-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
  padding: 3px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--accent-cyan-border);
  -webkit-user-select: none;
  user-select: none;
}

.draft-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
}

.btn-clear-draft {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
  -webkit-user-select: none;
  user-select: none;
  outline: none !important;
}

.btn-clear-draft:hover {
  color: var(--accent-red);
}

/* Dropzone & Assets Grid */
.assets-dropzone {
  position: relative;
  border: 2px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px;
  background: var(--bg-card-active);
  min-height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--theme-transition), border-color 0.15s ease;
}

.assets-dropzone.is-drop-active {
  border-color: var(--accent-cyan) !important;
  background: var(--accent-cyan-bg) !important;
  box-shadow: 0 0 25px var(--accent-cyan-border);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  z-index: 10;
  border-radius: var(--radius-md);
  color: var(--accent-cyan);
  padding: 16px;
  pointer-events: none;
  box-sizing: border-box;
}

.drop-icon-circle {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-full);
  background: var(--accent-cyan-bg);
  border: 1px solid var(--accent-cyan-border);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 15px var(--accent-cyan-border);
}

.drop-icon-circle .empty-icon {
  font-size: 1.6rem;
}

.drop-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent-cyan);
  margin: 0;
  text-align: center;
}

.drop-subtitle {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
  text-align: center;
}

.dropzone-hint {
  text-align: center;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
}

.empty-icon-circle {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-full);
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hint-icon {
  font-size: 1.6rem;
}

.hint-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.hint-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}

.assets-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.add-asset-tile {
  border: 2px dashed var(--border-subtle);
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-sm);
  min-height: 154px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--text-muted);
  -webkit-user-select: none;
  user-select: none;
  box-sizing: border-box;
}

.add-asset-tile:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
}

.tile-icon {
  font-size: 1.4rem;
}

.tile-title {
  font-size: 0.8rem;
  font-weight: 700;
}

.tile-sub {
  font-size: 0.7rem;
  opacity: 0.75;
}

.asset-card {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
}

.asset-preview-container {
  position: relative;
  width: 100%;
  height: 110px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #000000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vector-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.75);
  color: var(--accent-cyan);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent-cyan-border);
}

.asset-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-annotate {
  flex: 1;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-annotate:hover {
  background: var(--border-focus);
}

.btn-delete-asset {
  font-size: 0.8rem;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: rgba(239, 68, 68, 0.1);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.2);
  cursor: pointer;
}

.btn-delete-asset:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* AI Resolution Section */
.ai-section {
  padding: 14px;
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.22);
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ai-title {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--accent-green);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-status-pill {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: rgba(16, 185, 129, 0.15);
  color: var(--accent-green);
}

.ai-status-pill.pending {
  background: var(--bg-card-active);
  color: var(--text-muted);
}

.ai-textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--text-main);
  resize: vertical;
}

.ai-textarea:focus {
  border-color: var(--accent-green);
}

/* Footer */
.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-card);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
}

.footer-spacer {
  flex: 1;
}

.btn-secondary {
  height: 42px;
  padding: 0 20px;
  border-radius: var(--radius-sm);
  background: var(--bg-card-active);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  outline: none !important;
  user-select: none;
}

.btn-secondary:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-focus);
}

[data-theme="light"] .btn-secondary {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.15);
  color: #334155;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

[data-theme="light"] .btn-secondary:hover {
  background: #f8fafc;
  border-color: rgba(0, 0, 0, 0.25);
  color: #0f172a;
}

.btn-primary-save {
  height: 42px;
  padding: 0 24px;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan);
  color: #071324;
  font-size: 0.92rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.3);
  transition: opacity 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
  outline: none !important;
  user-select: none;
}

.btn-primary-save:hover {
  opacity: 0.94;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(56, 189, 248, 0.4);
}

.btn-primary-save:active {
  transform: translateY(0);
}

[data-theme="light"] .btn-primary-save {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #ffffff;
  box-shadow: 0 3px 12px rgba(2, 132, 199, 0.35);
}

[data-theme="light"] .btn-primary-save:hover {
  background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
  box-shadow: 0 4px 16px rgba(2, 132, 199, 0.45);
}

.btn-danger-delete {
  height: 42px;
  padding: 0 18px;
  border-radius: var(--radius-sm);
  background: rgba(239, 68, 68, 0.12);
  color: var(--accent-red);
  font-size: 0.88rem;
  font-weight: 600;
  border: 1px solid rgba(239, 68, 68, 0.25);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;
  outline: none !important;
  user-select: none;
}

.btn-danger-delete:hover {
  background: rgba(239, 68, 68, 0.22);
}
</style>
