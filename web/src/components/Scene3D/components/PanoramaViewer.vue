<template>
  <div class="go-panorama-overlay" @mousedown.stop @click.self="close">
    <div class="panorama-head" @mousedown.stop>
      <span class="panorama-title">{{ title || '360 街景' }}</span>
      <button class="panorama-close" type="button" data-testid="panorama-close" @click.stop="close">
        关闭
      </button>
    </div>
    <div ref="containerRef" class="panorama-body"></div>
    <div v-if="error" class="panorama-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import '@photo-sphere-viewer/core/index.css'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Viewer } from '@photo-sphere-viewer/core'

const props = defineProps<{
  imageUrl: string
  title?: string
}>()

const emit = defineEmits(['close'])
const containerRef = ref<HTMLElement | null>(null)
const error = ref('')
let viewer: Viewer | null = null

const close = () => emit('close')

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (!props.imageUrl) {
    error.value = '未配置全景图'
    return
  }
  try {
    viewer = new Viewer({
      container: containerRef.value as HTMLElement,
      panorama: props.imageUrl,
      navbar: false,
      loadingTxt: '全景图加载中…'
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '全景图加载失败'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (viewer) {
    viewer.destroy()
    viewer = null
  }
})
</script>

<style lang="scss" scoped>
.go-panorama-overlay {
  position: fixed;
  inset: 0;
  z-index: 90000;
  display: flex;
  flex-direction: column;
  background: #000;
}
.panorama-head {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  color: #e8fff7;
  background: rgba(7, 19, 31, 0.92);
  border-bottom: 1px solid rgba(81, 214, 169, 0.35);
}
.panorama-title {
  font-size: 15px;
  letter-spacing: 1px;
}
.panorama-close {
  height: 30px;
  padding: 0 16px;
  color: #07131f;
  background: #51d6a9;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.panorama-close:hover {
  background: #7ce6c4;
}
.panorama-body {
  flex: 1;
  min-height: 0;
}
.panorama-error {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 20px;
  color: #ffd7d7;
  background: rgba(60, 20, 20, 0.9);
  border: 1px solid #c05050;
  border-radius: 6px;
}
</style>
