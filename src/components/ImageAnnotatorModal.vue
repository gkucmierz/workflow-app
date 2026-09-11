<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { t } from '../locales.js';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  asset: {
    type: Object,
    default: null
  },
  project: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'save']);

const imageRef = ref(null);
const canvasRef = ref(null);

const currentTool = ref('arrow'); // 'arrow' | 'rect' | 'brush'
const currentColor = ref('#ef4444');
const currentStrokeWidth = ref(4);

const annotations = ref([]);
const isDrawing = ref(false);
const startPoint = ref({ x: 0, y: 0 });
const currentBrushPoints = ref([]);

const colors = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Yellow', hex: '#f59e0b' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Cyan', hex: '#38bdf8' },
  { name: 'White', hex: '#ffffff' }
];

const strokeWidths = [2, 4, 6];

// Initialize local annotations from asset
watch(
  () => props.asset,
  (newAsset) => {
    if (newAsset && Array.isArray(newAsset.annotations)) {
      annotations.value = JSON.parse(JSON.stringify(newAsset.annotations));
    } else {
      annotations.value = [];
    }
    nextTick(() => redrawCanvas());
  },
  { immediate: true }
);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      nextTick(() => {
        setupCanvas();
      });
    }
  }
);

// Map display canvas coords to natural image coords
const getNaturalCoords = (e) => {
  const canvas = canvasRef.value;
  const img = imageRef.value;
  if (!canvas || !img) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  const scaleX = img.naturalWidth / rect.width;
  const scaleY = img.naturalHeight / rect.height;

  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);

  return {
    x: Math.round((clientX - rect.left) * scaleX),
    y: Math.round((clientY - rect.top) * scaleY)
  };
};

const setupCanvas = () => {
  const img = imageRef.value;
  const canvas = canvasRef.value;
  if (!img || !canvas) return;

  if (img.complete && img.naturalWidth > 0) {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    redrawCanvas();
  } else {
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redrawCanvas();
    };
  }
};

// Drawing Helpers
const drawArrow = (ctx, fromX, fromY, toX, toY, color, width) => {
  const headLen = Math.max(16, width * 4);
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
};

const drawRect = (ctx, x, y, w, h, color, width) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeRect(x, y, w, h);
};

const drawBrush = (ctx, points, color, width) => {
  if (!points || points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
};

const redrawCanvas = (previewItem = null) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Render saved annotations
  for (const ann of annotations.value) {
    if (ann.type === 'arrow') {
      drawArrow(ctx, ann.from.x, ann.from.y, ann.to.x, ann.to.y, ann.color, ann.strokeWidth || 4);
    } else if (ann.type === 'rect') {
      drawRect(ctx, ann.x, ann.y, ann.width, ann.height, ann.color, ann.strokeWidth || 4);
    } else if (ann.type === 'brush') {
      drawBrush(ctx, ann.points, ann.color, ann.strokeWidth || 4);
    }
  }

  // Render active dragging preview
  if (previewItem) {
    if (previewItem.type === 'arrow') {
      drawArrow(ctx, previewItem.from.x, previewItem.from.y, previewItem.to.x, previewItem.to.y, previewItem.color, previewItem.strokeWidth);
    } else if (previewItem.type === 'rect') {
      drawRect(ctx, previewItem.x, previewItem.y, previewItem.width, previewItem.height, previewItem.color, previewItem.strokeWidth);
    } else if (previewItem.type === 'brush') {
      drawBrush(ctx, previewItem.points, previewItem.color, previewItem.strokeWidth);
    }
  }
};

// Pointer Events
const onPointerDown = (e) => {
  const pos = getNaturalCoords(e);
  isDrawing.value = true;
  startPoint.value = pos;

  if (currentTool.value === 'brush') {
    currentBrushPoints.value = [pos];
  }
};

const onPointerMove = (e) => {
  if (!isDrawing.value) return;
  const currentPos = getNaturalCoords(e);

  if (currentTool.value === 'arrow') {
    redrawCanvas({
      type: 'arrow',
      from: startPoint.value,
      to: currentPos,
      color: currentColor.value,
      strokeWidth: currentStrokeWidth.value
    });
  } else if (currentTool.value === 'rect') {
    const x = Math.min(startPoint.value.x, currentPos.x);
    const y = Math.min(startPoint.value.y, currentPos.y);
    const width = Math.abs(currentPos.x - startPoint.value.x);
    const height = Math.abs(currentPos.y - startPoint.value.y);
    redrawCanvas({
      type: 'rect',
      x,
      y,
      width,
      height,
      color: currentColor.value,
      strokeWidth: currentStrokeWidth.value
    });
  } else if (currentTool.value === 'brush') {
    currentBrushPoints.value.push(currentPos);
    redrawCanvas({
      type: 'brush',
      points: currentBrushPoints.value,
      color: currentColor.value,
      strokeWidth: currentStrokeWidth.value
    });
  }
};

const onPointerUp = (e) => {
  if (!isDrawing.value) return;
  isDrawing.value = false;
  const endPos = getNaturalCoords(e);

  if (currentTool.value === 'arrow') {
    const dist = Math.hypot(endPos.x - startPoint.value.x, endPos.y - startPoint.value.y);
    if (dist > 10) {
      annotations.value.push({
        type: 'arrow',
        from: startPoint.value,
        to: endPos,
        color: currentColor.value,
        strokeWidth: currentStrokeWidth.value
      });
    }
  } else if (currentTool.value === 'rect') {
    const width = Math.abs(endPos.x - startPoint.value.x);
    const height = Math.abs(endPos.y - startPoint.value.y);
    if (width > 8 && height > 8) {
      annotations.value.push({
        type: 'rect',
        x: Math.min(startPoint.value.x, endPos.x),
        y: Math.min(startPoint.value.y, endPos.y),
        width,
        height,
        color: currentColor.value,
        strokeWidth: currentStrokeWidth.value
      });
    }
  } else if (currentTool.value === 'brush') {
    if (currentBrushPoints.value.length > 1) {
      annotations.value.push({
        type: 'brush',
        points: [...currentBrushPoints.value],
        color: currentColor.value,
        strokeWidth: currentStrokeWidth.value
      });
    }
    currentBrushPoints.value = [];
  }

  redrawCanvas();
};

const undo = () => {
  if (annotations.value.length > 0) {
    annotations.value.pop();
    redrawCanvas();
  }
};

const clearAll = () => {
  annotations.value = [];
  redrawCanvas();
};

const saveAndClose = () => {
  emit('save', {
    filename: props.asset.filename,
    annotations: annotations.value
  });
  emit('close');
};

const closeModal = () => {
  emit('close');
};

const handleKeydown = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeModal();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && props.isOpen) {
    e.preventDefault();
    undo();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', setupCanvas);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', setupCanvas);
});
</script>

<template>
  <div v-if="isOpen && asset" class="annotator-overlay" @click.self="closeModal">
    <div class="annotator-window glass-panel">
      <!-- Top Toolbar -->
      <div class="annotator-header">
        <div class="toolbar-group">
          <span class="toolbar-label">{{ t('annotator.toolLabel') }}</span>
          <button
            class="tool-btn"
            :class="{ active: currentTool === 'arrow' }"
            @click="currentTool = 'arrow'"
          >
            {{ t('annotator.toolArrow') }}
          </button>
          <button
            class="tool-btn"
            :class="{ active: currentTool === 'rect' }"
            @click="currentTool = 'rect'"
          >
            {{ t('annotator.toolRect') }}
          </button>
          <button
            class="tool-btn"
            :class="{ active: currentTool === 'brush' }"
            @click="currentTool = 'brush'"
          >
            {{ t('annotator.toolBrush') }}
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <!-- Color Palette -->
        <div class="toolbar-group">
          <span class="toolbar-label">{{ t('annotator.colorLabel') }}</span>
          <div class="color-picker">
            <button
              v-for="c in colors"
              :key="c.hex"
              class="color-dot"
              :class="{ active: currentColor === c.hex }"
              :style="{ background: c.hex }"
              @click="currentColor = c.hex"
            ></button>
          </div>
        </div>

        <div class="toolbar-divider"></div>

        <!-- Stroke Width -->
        <div class="toolbar-group">
          <span class="toolbar-label">{{ t('annotator.widthLabel') }}</span>
          <button
            v-for="w in strokeWidths"
            :key="w"
            class="size-btn"
            :class="{ active: currentStrokeWidth === w }"
            @click="currentStrokeWidth = w"
          >
            {{ w }}px
          </button>
        </div>

        <div class="toolbar-spacer"></div>

        <!-- Actions -->
        <div class="toolbar-group">
          <button class="action-btn" @click="undo">
            {{ t('annotator.undo') }}
          </button>
          <button class="action-btn" @click="clearAll">
            {{ t('annotator.clear') }}
          </button>
          <button class="btn-save-annotation" @click="saveAndClose">
            {{ t('annotator.save') }}
          </button>
          <button class="btn-close" @click="closeModal">✕</button>
        </div>
      </div>

      <!-- Canvas Workspace -->
      <div class="annotator-viewport">
        <div class="canvas-wrapper">
          <img
            ref="imageRef"
            :src="asset.url || `/data/${project}/assets/${asset.filename}`"
            class="source-image"
            alt="Source screenshot"
            @load="setupCanvas"
          />
          <canvas
            ref="canvasRef"
            class="annotation-canvas"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
          ></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.annotator-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.annotator-window {
  width: 96vw;
  height: 94vh;
  display: flex;
  flex-direction: column;
  background: #0b1120;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.9);
}

.annotator-header {
  padding: 10px 16px;
  background: rgba(15, 23, 42, 0.8);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: rgba(255, 255, 255, 0.1);
}

.toolbar-spacer {
  flex: 1;
}

.tool-btn {
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}

.tool-btn.active {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border-color: rgba(56, 189, 248, 0.4);
}

.color-picker {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.color-dot:hover {
  transform: scale(1.15);
}

.color-dot.active {
  border-color: #ffffff;
  transform: scale(1.2);
}

.size-btn {
  font-size: 0.76rem;
  font-family: var(--font-mono);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  border: 1px solid transparent;
  cursor: pointer;
}

.size-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.3);
}

.action-btn {
  font-size: 0.8rem;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}

.btn-save-annotation {
  font-size: 0.82rem;
  font-weight: 700;
  background: var(--accent-green);
  color: #042f2e;
  border: none;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-save-annotation:hover {
  opacity: 0.9;
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
  color: #ffffff;
}

/* Viewport & Canvas overlay */
.annotator-viewport {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: radial-gradient(circle at center, rgba(30, 41, 59, 0.3) 0%, rgba(11, 17, 32, 0.8) 100%);
}

.canvas-wrapper {
  position: relative;
  display: inline-block;
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
}

.source-image {
  display: block;
  max-width: 88vw;
  max-height: 82vh;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
}

.annotation-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}
</style>
