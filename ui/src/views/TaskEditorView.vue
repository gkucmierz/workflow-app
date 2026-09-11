<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { t } from '../locales.js';
import { getDeterministicHue } from '../colors.js';
import ImageAnnotatorModal from '../components/ImageAnnotatorModal.vue';

const route = useRoute();
const router = useRouter();

const project = computed(() => (route.params.project || '').toString());
const taskId = computed(() => (route.params.taskId || '').toString());
const isEditing = computed(() => Boolean(taskId.value));

const taskText = ref('');
const assets = ref([]);
const answerText = ref('');
const isDone = ref(false);
const isUploading = ref(false);
const isSaving = ref(false);
const hasSavedDraft = ref(false);
const isCommonProblem = ref(false);
const duplicateAlerts = ref([]);

// Helper: Compute SHA-256 in browser via Web Crypto
const computeFileSha256 = async (file) => {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
};

// Annotator Modal
const isAnnotatorOpen = ref(false);
const annotatingAsset = ref(null);

// Storage key for drafts
const getStorageKey = () => {
  if (isEditing.value && taskId.value) {
    return `workflow_draft_edit_${project.value}_${taskId.value}`;
  }
  return `workflow_draft_new_${project.value || 'default'}`;
};

const saveDraft = (text) => {
  const key = getStorageKey();
  if (!key) return;
  if (text && text.trim().length > 0) {
    try {
      sessionStorage.setItem(key, text);
      localStorage.setItem(key, text);
      hasSavedDraft.value = true;
    } catch (e) {}
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

const savedOriginalTask = ref(null);

const clearDraft = () => {
  const key = getStorageKey();
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch (e) {}
  hasSavedDraft.value = false;
};

watch(taskText, (newVal) => {
  saveDraft(newVal);
});

// Load task data (if editing) or restore new task draft
const loadData = async () => {
  if (isEditing.value) {
    try {
      const res = await fetch(`/api/projects/${project.value}/tasks`);
      const allTasks = await res.json();
      const current = allTasks.find(t => t.id === taskId.value);
      if (current) {
        savedOriginalTask.value = current.task || '';
        const savedDraft = loadDraft();
        taskText.value = (savedDraft !== null && savedDraft !== undefined && savedDraft.trim().length > 0)
          ? savedDraft
          : (current.task || '');
        assets.value = JSON.parse(JSON.stringify(current.assets || []));
        answerText.value = current.answer || '';
        isDone.value = Boolean(current.done);
        isCommonProblem.value = Boolean(current.common_problem);
      }
    } catch (err) {
      console.error('Failed to load task for edit:', err);
    }
  } else {
    // New task mode
    const savedDraft = loadDraft();
    taskText.value = savedDraft || '';
    assets.value = [];
    answerText.value = '';
    isDone.value = false;
    isCommonProblem.value = false;

    // Check for staged assets from drag-and-drop
    const stagedKey = `workflow_staged_assets_${project.value}`;
    try {
      const stagedRaw = sessionStorage.getItem(stagedKey);
      if (stagedRaw) {
        const stagedFiles = JSON.parse(stagedRaw);
        if (Array.isArray(stagedFiles)) {
          for (const f of stagedFiles) {
            if (!assets.value.some(a => a.filename === f.filename)) {
              assets.value.push({
                filename: f.filename,
                url: f.url,
                hash: f.hash,
                isDuplicate: Boolean(f.deduplicated),
                annotations: []
              });
            }
          }
        }
        sessionStorage.removeItem(stagedKey);
      }
    } catch (e) {}
  }
};

// Upload screenshots with SHA-256 deduplication and duplicate notification
const uploadFiles = async (files) => {
  if (!files || files.length === 0 || !project.value) return;
  isUploading.value = true;

  try {
    const filesToUpload = [];
    for (const f of files) {
      const fileHash = await computeFileSha256(f);
      // Check if already in current task
      const alreadyInTask = assets.value.some(
        a => (fileHash && a.hash === fileHash) || a.filename === f.name
      );
      if (alreadyInTask) {
        duplicateAlerts.value.push({
          id: Date.now() + Math.random(),
          type: 'task',
          message: t('taskModal.duplicateInTask', {
            name: f.name,
            hash: fileHash ? fileHash.slice(0, 10) : 'sha256'
          })
        });
        continue;
      }
      filesToUpload.push({ file: f, hash: fileHash });
    }

    if (filesToUpload.length === 0) return;

    const formData = new FormData();
    for (const item of filesToUpload) {
      formData.append('files', item.file);
    }

    const res = await fetch(`/api/projects/${project.value}/assets`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success && Array.isArray(data.files)) {
      for (const uploaded of data.files) {
        if (uploaded.deduplicated) {
          duplicateAlerts.value.push({
            id: Date.now() + Math.random(),
            type: 'app',
            message: t('taskModal.duplicateInProject', {
              name: uploaded.filename,
              project: uploaded.existingProject || project.value,
              existing: uploaded.existingFilename || uploaded.filename,
              hash: (uploaded.hash || '').slice(0, 10)
            })
          });
        }

        const alreadyExists = assets.value.some(
          a => a.filename === uploaded.filename || (uploaded.hash && a.hash === uploaded.hash)
        );
        if (!alreadyExists) {
          assets.value.push({
            filename: uploaded.filename,
            url: uploaded.url,
            hash: uploaded.hash,
            isDuplicate: Boolean(uploaded.deduplicated),
            annotations: []
          });
        }
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

const removeAsset = (index) => {
  assets.value.splice(index, 1);
};

const openAnnotator = (asset) => {
  annotatingAsset.value = asset;
  isAnnotatorOpen.value = true;
};

const onAnnotationSave = (newAnnotations) => {
  if (annotatingAsset.value) {
    annotatingAsset.value.annotations = newAnnotations;
  }
  isAnnotatorOpen.value = false;
  annotatingAsset.value = null;
};

// Drag & Drop onto View / Dropzone
const isDropZoneDragging = ref(false);

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
  const rawFiles = Array.from(e.dataTransfer?.files || []);
  const files = rawFiles.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name));
  if (files.length > 0) {
    uploadFiles(files);
  }
};

// Navigation / Back
const goBack = () => {
  router.push(`/p/${project.value}`);
};

// Auto-remove trailing spaces at ends of lines and trim outer whitespace
const cleanText = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
};

const onTextareaBlur = () => {
  if (taskText.value) {
    taskText.value = cleanText(taskText.value);
  }
};

// Save Task
const handleSave = async () => {
  if (isSaving.value) return;
  isSaving.value = true;

  try {
    const cleanedTask = cleanText(taskText.value);
    const cleanedAnswer = cleanText(answerText.value);
    taskText.value = cleanedTask;
    answerText.value = cleanedAnswer;

    const payload = {
      task: cleanedTask,
      assets: assets.value,
      answer: cleanedAnswer,
      common_problem: isCommonProblem.value,
      done: isDone.value
    };

    if (isEditing.value) {
      await fetch(`/api/projects/${project.value}/tasks/${taskId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch(`/api/projects/${project.value}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    clearDraft();
    goBack();
  } catch (err) {
    console.error('Failed to save task:', err);
  } finally {
    isSaving.value = false;
  }
};

// Delete Task
const handleDelete = async () => {
  if (!isEditing.value) return;
  if (!confirm(t('taskModal.deleteConfirm'))) return;

  try {
    await fetch(`/api/projects/${project.value}/tasks/${taskId.value}`, {
      method: 'DELETE'
    });
    clearDraft();
    goBack();
  } catch (err) {
    console.error('Failed to delete task:', err);
  }
};

// Keyboard ESC Dismissal (Rule 6.1)
const handleGlobalKeydown = (e) => {
  if (e.key === 'Escape') {
    if (isAnnotatorOpen.value) {
      e.stopPropagation();
      isAnnotatorOpen.value = false;
      annotatingAsset.value = null;
      return;
    }
    e.stopPropagation();
    goBack();
  }
};

onMounted(() => {
  loadData();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <main class="task-editor-view">
    <div class="editor-container glass-card">
      <!-- TOP BAR -->
      <header class="editor-header">
        <div class="header-left">
          <button class="btn-back" @click="goBack">
            {{ t('taskModal.backToBoard') }}
          </button>
          <span
            v-if="project"
            class="project-tag-pill"
            :style="{ '--proj-hue': getDeterministicHue(project) }"
          >
            {{ project }}
          </span>
          <h2 class="view-title">
            {{ isEditing ? t('taskModal.detailsTitle') : t('taskModal.newTitle') }}
          </h2>
        </div>

        <div class="header-right">
          <!-- Common Problem Switch -->
          <button
            class="common-toggle-btn"
            :class="{ 'is-common': isCommonProblem }"
            @click="isCommonProblem = !isCommonProblem"
          >
            <span class="toggle-switch-track">
              <span class="toggle-switch-thumb"></span>
            </span>
            <span class="toggle-status-label">
              {{ t('taskModal.commonProblemLabel') }}
            </span>
          </button>

          <!-- Status Switch -->
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
        </div>
      </header>

      <!-- MAIN CONTENT FORM -->
      <div class="editor-body">
        <!-- Section 1: Task Description -->
        <section class="form-section">
          <div class="section-header">
            <label class="section-label">{{ t('taskModal.taskDescLabel') }}</label>
            <div v-if="hasSavedDraft" class="draft-indicator">
              <span class="draft-badge">✓ {{ t('taskModal.draftSaved') }}</span>
            </div>
          </div>
          <textarea
            v-model="taskText"
            class="task-textarea selectable"
            :placeholder="t('taskModal.taskDescPlaceholder')"
            rows="7"
            autofocus
            @blur="onTextareaBlur"
          ></textarea>
        </section>

        <!-- Section 2: Screenshots & Vectors -->
        <section class="form-section">
          <div class="section-header">
            <label class="section-label">
              {{ t('taskModal.assetsLabel', { count: assets.length }) }}
            </label>
            <label class="btn-add-screenshot">
              <span>{{ t('taskModal.addScreenshot') }}</span>
              <input
                type="file"
                multiple
                accept="image/*"
                class="hidden-file-input"
                @change="onFileInputChange"
              />
            </label>
          </div>

          <!-- Duplicate Asset Notifications -->
          <div v-if="duplicateAlerts.length > 0" class="duplicate-alert-list animate-fade-in">
            <div
              v-for="(alert, aIdx) in duplicateAlerts"
              :key="alert.id || aIdx"
              class="duplicate-alert-card"
            >
              <span class="duplicate-alert-icon">🔁</span>
              <div class="duplicate-alert-body">
                <span class="duplicate-alert-title">{{ t('taskModal.duplicateFoundTitle') }}</span>
                <span class="duplicate-alert-msg">{{ alert.message }}</span>
              </div>
              <button
                type="button"
                class="duplicate-alert-close"
                @click="duplicateAlerts.splice(aIdx, 1)"
              >✕</button>
            </div>
          </div>

          <!-- Drag and drop zone -->
          <div
            class="assets-dropzone"
            :class="{ 'is-dragging': isDropZoneDragging }"
            @dragenter="onDropZoneDragEnter"
            @dragover="onDropZoneDragOver"
            @dragleave="onDropZoneDragLeave"
            @drop="onDropZone"
          >
            <div v-if="isDropZoneDragging" class="drop-active-state">
              <span class="drop-icon">📥</span>
              <p class="drop-text">{{ t('taskModal.dropOverlayTitle') }}</p>
            </div>

            <div v-else-if="assets.length === 0" class="drop-empty-state">
              <span class="drop-icon">🖼️</span>
              <p class="drop-title">{{ t('taskModal.dropzoneTitle') }}</p>
              <p class="drop-subtitle">{{ t('taskModal.dropzoneSubtitle') }}</p>
            </div>

            <!-- Screenshots Tiles Strip -->
            <div v-else class="assets-tiles-grid">
              <div
                v-for="(asset, idx) in assets"
                :key="asset.filename"
                class="asset-tile"
              >
                <div class="asset-preview-box">
                  <img
                    :src="asset.url || `/data/${project}/assets/${asset.filename}`"
                    class="asset-image"
                    alt="Uploaded preview"
                  />
                  <!-- Duplicate Asset Badge -->
                  <span
                    v-if="asset.isDuplicate || asset.deduplicated"
                    class="duplicate-asset-badge"
                  >
                    🔁 {{ t('taskModal.duplicateBadge') }}
                  </span>
                  <span
                    v-if="asset.annotations && asset.annotations.length > 0"
                    class="asset-vectors-badge"
                  >
                    {{ t('taskModal.vectorCount', { count: asset.annotations.length }) }}
                  </span>
                </div>

                <div class="asset-tile-actions">
                  <button
                    class="btn-annotate"
                    @click="openAnnotator(asset)"
                  >
                    {{ t('taskModal.annotateBtn') }}
                  </button>
                  <button
                    class="btn-delete-asset"
                    @click="removeAsset(idx)"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <!-- Add More Tile -->
              <label class="asset-tile-add">
                <span class="add-icon">+</span>
                <span class="add-text">{{ t('taskModal.addTileTitle') }}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  class="hidden-file-input"
                  @change="onFileInputChange"
                />
              </label>
            </div>
          </div>
        </section>

        <!-- Section 3: AI Agent Response / Solution -->
        <section class="form-section ai-section">
          <div class="section-header">
            <div class="ai-header-left">
              <label class="section-label ai-label">{{ t('taskModal.aiHeader') }}</label>
              <span
                class="ai-status-pill"
                :class="answerText.trim() ? 'filled' : 'pending'"
              >
                {{ answerText.trim() ? t('taskModal.aiStatusFilled') : t('taskModal.aiStatusPending') }}
              </span>
            </div>
          </div>
          <textarea
            v-model="answerText"
            class="ai-textarea selectable"
            :placeholder="t('taskModal.aiPlaceholder')"
            rows="4"
          ></textarea>
        </section>
      </div>

      <!-- FOOTER ACTIONS -->
      <footer class="editor-footer">
        <div class="footer-left">
          <button
            v-if="isEditing"
            class="btn-danger"
            @click="handleDelete"
          >
            {{ t('taskModal.deleteBtn') }}
          </button>
        </div>

        <div class="footer-right">
          <button class="btn-secondary" @click="goBack">
            {{ t('taskModal.cancelBtn') }}
          </button>
          <button
            class="btn-primary"
            :disabled="isSaving"
            @click="handleSave"
          >
            {{ isEditing ? t('taskModal.saveBtn') : t('taskModal.createBtn') }}
          </button>
        </div>
      </footer>
    </div>

    <!-- Image Annotator Modal -->
    <ImageAnnotatorModal
      :is-open="isAnnotatorOpen"
      :asset="annotatingAsset"
      :project="project"
      @close="isAnnotatorOpen = false"
      @save="onAnnotationSave"
    />
  </main>
</template>

<style scoped>
.task-editor-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
}

.editor-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-panel);
  box-shadow: var(--shadow-card);
  box-sizing: border-box;
}

/* HEADER */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
  gap: 16px;
  -webkit-user-select: none;
  user-select: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
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
  user-select: none;
}

.btn-back:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-cyan-border);
  color: var(--accent-cyan);
}

.project-tag-pill {
  font-size: 0.8rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 4px 10px;
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

.view-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
  letter-spacing: -0.01em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* BODY FORM */
.editor-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  -webkit-user-select: none;
  user-select: none;
}

.section-label {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.draft-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.draft-badge {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
  border: 1px solid var(--accent-cyan-border);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.task-textarea {
  width: 100%;
  min-height: 180px;
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-input);
  color: var(--text-main);
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
  outline: none !important;
  transition: var(--theme-transition), border-color 0.15s ease;
  box-sizing: border-box;
}

.task-textarea:focus {
  border-color: var(--border-focus);
}

/* ASSETS DROPZONE */
.assets-dropzone {
  min-height: 140px;
  padding: 16px;
  border: 2px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

[data-theme="light"] .assets-dropzone {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(0, 0, 0, 0.12);
}

.assets-dropzone.is-dragging {
  border-color: var(--accent-cyan) !important;
  background: var(--accent-cyan-bg) !important;
}

.drop-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding: 16px;
  -webkit-user-select: none;
  user-select: none;
}

.drop-icon {
  font-size: 2rem;
}

.drop-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.drop-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}

.drop-active-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--accent-cyan);
}

.drop-text {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
}

.btn-add-screenshot {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: all 0.15s ease;
  outline: none !important;
}

.btn-add-screenshot:hover {
  background: var(--accent-cyan);
  color: #071324;
}

[data-theme="light"] .btn-add-screenshot:hover {
  background: #0284c7;
  color: #ffffff;
}

.hidden-file-input {
  display: none;
}

/* TILES GRID */
.assets-tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.asset-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  box-sizing: border-box;
}

.asset-preview-box {
  position: relative;
  width: 100%;
  height: 110px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
}

.asset-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-vectors-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.8);
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
}

.asset-tile-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-annotate {
  flex: 1;
  font-size: 0.76rem;
  font-weight: 700;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan-bg);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  outline: none !important;
}

.btn-annotate:hover {
  background: var(--accent-cyan);
  color: #071324;
}

[data-theme="light"] .btn-annotate:hover {
  background: #0284c7;
  color: #ffffff;
}

.btn-delete-asset {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  outline: none !important;
  font-size: 0.78rem;
  transition: background 0.15s ease;
}

.btn-delete-asset:hover {
  background: rgba(239, 68, 68, 0.25);
}

.asset-tile-add {
  height: 154px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  background: rgba(255, 255, 255, 0.02);
  -webkit-user-select: none;
  user-select: none;
}

[data-theme="light"] .asset-tile-add {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(0, 0, 0, 0.15);
}

.asset-tile-add:hover {
  border-color: var(--accent-cyan);
  background: var(--accent-cyan-bg);
}

.add-icon {
  font-size: 1.6rem;
  color: var(--accent-cyan);
  line-height: 1;
}

.add-text {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* AI SECTION */
.ai-section {
  padding: 16px;
  border-radius: var(--radius-md);
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.18);
}

.ai-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-label {
  color: var(--accent-green) !important;
}

.ai-status-pill {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ai-status-pill.pending {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-muted);
}

.ai-status-pill.filled {
  background: rgba(16, 185, 129, 0.2);
  color: var(--accent-green);
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.ai-textarea {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(16, 185, 129, 0.2);
  background: var(--bg-input);
  color: var(--text-main);
  font-family: var(--font-sans);
  font-size: 0.92rem;
  line-height: 1.5;
  resize: vertical;
  outline: none !important;
  box-sizing: border-box;
}

.ai-textarea:focus {
  border-color: var(--accent-green);
}

/* FOOTER */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  -webkit-user-select: none;
  user-select: none;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-secondary {
  height: 42px;
  padding: 0 20px;
  font-size: 0.9rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none !important;
}

.btn-secondary:hover {
  background: var(--bg-card-hover);
}

.btn-primary {
  height: 42px;
  padding: 0 24px;
  font-size: 0.92rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  background: var(--accent-cyan);
  color: #071324;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
  outline: none !important;
  box-shadow: 0 4px 14px rgba(56, 189, 248, 0.28);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

[data-theme="light"] .btn-primary {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.32);
}

.btn-danger {
  height: 42px;
  padding: 0 16px;
  font-size: 0.88rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  background: rgba(239, 68, 68, 0.12);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.28);
  cursor: pointer;
  transition: background 0.15s ease;
  outline: none !important;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.22);
}
</style>
