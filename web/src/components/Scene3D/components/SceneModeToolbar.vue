<template>
  <div v-if="editable" class="scene-mode-toolbar" @mousedown.stop @pointerdown.stop>
    <button
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
defineProps<{
  editable?: boolean
  interactive?: boolean
}>()

const emit = defineEmits(['toggle-interactive'])
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
.scene-interact-btn {
  min-width: 62px;
}
</style>
