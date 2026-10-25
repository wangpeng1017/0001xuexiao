<template>
  <div class="scene-mode-toolbar" @mousedown.stop @pointerdown.stop>
    <button
      v-for="item in modes"
      :key="item.value"
      type="button"
      class="scene-mode-btn"
      :class="{ active: mode === item.value }"
      :disabled="disabled"
      :title="item.title"
      :data-testid="`scene-mode-${item.value}`"
      @click.stop="emit('change', item.value)"
    >
      {{ item.label }}
    </button>
    <span class="scene-mode-divider"></span>
    <button
      v-if="editable"
      type="button"
      class="scene-mode-btn scene-interact-btn"
      :class="{ active: interactive }"
      title="开启后用鼠标旋转、缩放三维场景（再次点击退出）"
      data-testid="scene-interact-toggle"
      @click.stop="emit('toggle-interactive')"
    >
      调整视角
    </button>
  </div>
</template>

<script setup lang="ts">
import { SceneMode } from '../types'

defineProps<{
  mode: SceneMode
  disabled?: boolean
  editable?: boolean
  interactive?: boolean
}>()

const emit = defineEmits(['change', 'toggle-interactive'])

const modes: Array<{ value: SceneMode; label: string; title: string }> = [
  { value: '3D', label: '3D', title: '三维视图' },
  { value: '2.5D', label: '2.5D', title: '哥伦布视图（2.5D）' },
  { value: '2D', label: '2D', title: '二维视图' }
]
</script>

<style lang="scss" scoped>
.scene-mode-toolbar {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 6px;
  background: rgba(7, 19, 31, 0.78);
  border: 1px solid rgba(81, 214, 169, 0.38);
  backdrop-filter: blur(4px);
  pointer-events: auto;
}
.scene-mode-btn {
  height: 26px;
  min-width: 34px;
  padding: 0 8px;
  color: #b8d9d2;
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  transition: all 0.2s;
}
.scene-mode-btn:hover {
  color: #ffffff;
  border-color: rgba(81, 214, 169, 0.5);
}
.scene-mode-btn.active {
  color: #07131f;
  background: #51d6a9;
  border-color: #51d6a9;
}
.scene-mode-btn:disabled {
  cursor: wait;
  opacity: 0.55;
}
.scene-mode-divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.18);
}
.scene-interact-btn {
  min-width: 62px;
}
</style>
