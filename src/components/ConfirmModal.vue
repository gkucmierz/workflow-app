<script setup>
import { t } from '../locales.js';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  details: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: ''
  },
  cancelText: {
    type: String,
    default: ''
  },
  isDanger: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['confirm', 'cancel']);

const onCancel = () => {
  emit('cancel');
};

const onConfirm = () => {
  emit('confirm');
};
</script>

<template>
  <NanoModal
    :visible="isOpen"
    :title="title || t('confirmModal.title')"
    :width="460"
    :showOk="false"
    :showCancel="false"
    :closeOnBackdrop="true"
    :glassmorphism="true"
    @close="onCancel"
  >
    <template #body>
      <div class="confirm-content">
        <div class="confirm-icon-row">
          <div class="warning-badge" :class="{ danger: isDanger }">
            <svg
              v-if="isDanger"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div class="confirm-message-group">
            <p class="confirm-message">
              {{ message || t('confirmModal.message') }}
            </p>
          </div>
        </div>

        <div v-if="details" class="confirm-command-box">
          <span class="cmd-prompt">$</span>
          <code class="cmd-code">{{ details }}</code>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="confirm-actions">
        <button class="btn-cancel" @click="onCancel" v-ripple>
          {{ cancelText || t('confirmModal.cancelBtn') }}
        </button>
        <button
          class="btn-confirm"
          :class="{ 'btn-danger': isDanger, 'btn-primary': !isDanger }"
          @click="onConfirm"
          v-ripple
        >
          <span>{{ confirmText || t('confirmModal.confirmBtn') }}</span>
        </button>
      </div>
    </template>
  </NanoModal>
</template>

<style scoped>
.confirm-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.confirm-icon-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.warning-badge {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(56, 189, 248, 0.12);
  color: var(--accent-cyan);
  border: 1px solid var(--accent-cyan-border);
}

.warning-badge.danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.28);
}

.confirm-message-group {
  flex: 1;
  padding-top: 2px;
}

.confirm-message {
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--text-main);
  margin: 0;
  -webkit-user-select: text;
  user-select: text;
}

.confirm-command-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-subtle);
}

[data-theme="light"] .confirm-command-box {
  background: #e2e8f0;
  border-color: rgba(0, 0, 0, 0.08);
}

.cmd-prompt {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dim);
  -webkit-user-select: none;
  user-select: none;
}

.cmd-code {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--accent-cyan);
  word-break: break-all;
  -webkit-user-select: text;
  user-select: text;
}

[data-theme="light"] .cmd-code {
  color: #0284c7;
}

.confirm-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
  -webkit-user-select: none;
  user-select: none;
}

.btn-cancel {
  height: 38px;
  padding: 0 18px;
  font-size: 0.88rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none !important;
}

.btn-cancel:hover {
  background: var(--bg-card-hover);
}

.btn-confirm {
  height: 38px;
  padding: 0 20px;
  font-size: 0.88rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s ease;
  outline: none !important;
  color: #ffffff;
  border: none;
}

.btn-confirm.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.32);
}

.btn-confirm.btn-danger:hover {
  filter: brightness(1.08);
  box-shadow: 0 6px 18px rgba(239, 68, 68, 0.45);
}

.btn-confirm.btn-primary {
  background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);
}

.btn-confirm.btn-primary:hover {
  filter: brightness(1.08);
  box-shadow: 0 6px 18px rgba(2, 132, 199, 0.42);
}
</style>
