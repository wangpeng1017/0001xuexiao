<template>
  <div class="camera-panel">
    <div class="camera-block">
      <div class="block-title">底图</div>
      <n-select
        v-model:value="optionData.baseLayer"
        size="small"
        :options="[
          { label: 'Natural Earth II（离线）', value: 'naturalEarth' },
          { label: '不加载底图', value: 'none' }
        ]"
      />
    </div>

    <div class="camera-block">
      <div class="block-title">初始模式</div>
      <n-select
        :value="optionData.sceneMode || '3D'"
        size="small"
        :options="[
          { label: '3D 三维', value: '3D' },
          { label: '2.5D 哥伦布', value: '2.5D' },
          { label: '2D 二维', value: '2D' }
        ]"
        data-testid="scene-initial-mode"
        @update:value="changeInitialMode"
      />
    </div>

    <div class="camera-block">
      <div class="block-title">初始视角</div>
      <div class="camera-summary" data-testid="camera-summary">
        <span>经度 {{ camera.lon.toFixed(4) }}</span>
        <span>纬度 {{ camera.lat.toFixed(4) }}</span>
        <span>高度 {{ Math.round(camera.height) }} m</span>
        <span>朝向 {{ Math.round(camera.heading) }}°</span>
        <span>俯仰 {{ Math.round(camera.pitch) }}°</span>
      </div>
      <n-button
        class="camera-button"
        size="small"
        type="primary"
        ghost
        data-testid="scene-capture-camera"
        @click="captureCurrent"
      >
        把当前视角设为初始视角
      </n-button>
      <n-button
        class="camera-button"
        size="small"
        ghost
        data-testid="scene-restore-camera"
        @click="restoreInitial"
      >
        回到初始视角
      </n-button>
      <div class="camera-tip">
        调整视角：点击场景右上角“调整视角”，用鼠标旋转/缩放后再保存。预览与发布页不显示该按钮，直接用鼠标操作。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getSceneController } from '../registry'
import { DEFAULT_CAMERA } from '../defaults'
import { Scene3DOption } from '../types'

const props = defineProps<{
  optionData: Scene3DOption
}>()

const numberOr = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback

const camera = computed(() => {
  const raw = props.optionData.camera || DEFAULT_CAMERA
  return {
    lon: numberOr(raw.lon, DEFAULT_CAMERA.lon),
    lat: numberOr(raw.lat, DEFAULT_CAMERA.lat),
    height: numberOr(raw.height, DEFAULT_CAMERA.height),
    heading: numberOr(raw.heading, DEFAULT_CAMERA.heading),
    pitch: numberOr(raw.pitch, DEFAULT_CAMERA.pitch),
    roll: numberOr(raw.roll, DEFAULT_CAMERA.roll)
  }
})

const changeInitialMode = (mode: Scene3DOption['sceneMode']) => {
  const controller = getSceneController(props.optionData)
  if (controller && controller.isReady()) controller.setSceneMode(mode)
  else props.optionData.sceneMode = mode
}

const captureCurrent = () => {
  const controller = getSceneController(props.optionData)
  if (!controller || !controller.isReady()) {
    window['$message'].warning('三维场景尚未就绪')
    return
  }
  const state = controller.captureCamera()
  if (!state) {
    window['$message'].warning('读取当前视角失败')
    return
  }
  props.optionData.camera = {
    lon: Number(state.lon.toFixed(6)),
    lat: Number(state.lat.toFixed(6)),
    height: Number(state.height.toFixed(2)),
    heading: Number(state.heading.toFixed(2)),
    pitch: Number(state.pitch.toFixed(2)),
    roll: Number(state.roll.toFixed(2))
  }
  window['$message'].success('已把当前视角设为初始视角')
}

const restoreInitial = () => {
  const controller = getSceneController(props.optionData)
  if (!controller || !controller.isReady()) {
    window['$message'].warning('三维场景尚未就绪')
    return
  }
  controller.applyCamera(camera.value, 1.2)
}
</script>

<style lang="scss" scoped>
.camera-panel {
  width: 100%;
}
.camera-block + .camera-block {
  margin-top: 10px;
}
.block-title {
  margin-bottom: 5px;
  font-size: 12px;
  color: #b9d4cd;
}
.camera-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 6px 8px;
  font-size: 11px;
  color: #b9d4cd;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}
.camera-button {
  width: 100%;
  margin-top: 6px;
}
.camera-tip {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.6;
  color: #7f9993;
}
</style>
