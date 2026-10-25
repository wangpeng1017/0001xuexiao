<template>
  <div class="model-properties">
    <setting-item-box name="模型地址">
      <n-input v-model:value="layer.source.url" size="small" placeholder="glTF / 3D Tiles 地址" data-testid="model-property-url" />
      <div class="meta">当前格式：{{ offsetMode ? '3D Tiles' : 'glTF / GLB' }}</div>
    </setting-item-box>

    <setting-item-box :name="offsetMode ? '整体平移（3D Tiles）' : '位置与姿态'">
      <div class="coord-grid">
        <setting-item :name="offsetMode ? '经度偏移' : '经度'">
          <n-input-number v-model:value="position.lon" size="small" :precision="6" :step="offsetMode ? 0.0001 : 0.001" data-testid="model-lon" />
        </setting-item>
        <setting-item :name="offsetMode ? '纬度偏移' : '纬度'">
          <n-input-number v-model:value="position.lat" size="small" :precision="6" :step="offsetMode ? 0.0001 : 0.001" data-testid="model-lat" />
        </setting-item>
        <setting-item :name="offsetMode ? '高度偏移' : '高度(米)'">
          <n-input-number v-model:value="position.height" size="small" :step="10" data-testid="model-height" />
        </setting-item>
        <setting-item name="缩放">
          <n-input-number v-model:value="layer.source.scale" size="small" :min="0.0001" :step="0.1" data-testid="model-scale" />
        </setting-item>
      </div>

      <div v-if="!offsetMode" class="coord-grid">
        <setting-item name="朝向">
          <n-input-number v-model:value="rotation.heading" size="small" :step="5" />
        </setting-item>
        <setting-item name="俯仰">
          <n-input-number v-model:value="rotation.pitch" size="small" :step="5" />
        </setting-item>
        <setting-item name="翻滚">
          <n-input-number v-model:value="rotation.roll" size="small" :step="5" />
        </setting-item>
      </div>

      <n-button
        v-if="!offsetMode"
        class="pick-btn"
        size="small"
        type="primary"
        ghost
        data-testid="model-pick-position"
        @click="startPick"
      >
        拾取位置
      </n-button>
      <div class="tip">
        {{ offsetMode ? '3D Tiles 通过整体平移调整位置，模型自身的坐标系保持不变。' : '点击“拾取位置”后在地图上单击，模型会移动到该点。' }}
      </div>
    </setting-item-box>

    <setting-item-box v-if="offsetMode" name="点云样式">
      <div class="coord-grid">
        <setting-item name="点大小">
          <n-input-number v-model:value="layer.style.pointSize" size="small" :min="0.5" :step="0.5" />
        </setting-item>
        <setting-item name="着色">
          <n-select
            v-model:value="layer.style.colorBy"
            size="small"
            :options="[
              { label: '按 RGB', value: 'rgb' },
              { label: '按高程', value: 'height' }
            ]"
          />
        </setting-item>
      </div>
    </setting-item-box>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getSceneController } from '../registry'
import { Scene3DOption, SceneLayer } from '../types'
import { SettingItem, SettingItemBox } from '@/components/Pages/ChartItemSetting'

const props = defineProps<{
  optionData: Scene3DOption
  layer: SceneLayer
}>()

if (!props.layer.source.position) {
  props.layer.source.position = { lon: 116.39, lat: 39.9, height: 0 }
}
if (!props.layer.source.rotation) {
  props.layer.source.rotation = { heading: 0, pitch: 0, roll: 0 }
}
if (props.layer.source.scale === undefined) props.layer.source.scale = 1

const position = props.layer.source.position
const rotation = props.layer.source.rotation

const offsetMode = computed(
  () =>
    props.layer.source.format === '3dtiles' ||
    /tileset\.json(\?|$)/i.test(props.layer.source.url || '')
)

const startPick = () => {
  const controller = getSceneController(props.optionData)
  if (!controller || !controller.isReady()) {
    window['$message'].warning('三维场景尚未就绪')
    return
  }
  window['$message'].info('请在地图上单击目标位置')
  controller.startPickPosition(picked => {
    position.lon = Number(picked.lon.toFixed(6))
    position.lat = Number(picked.lat.toFixed(6))
    position.height = Number(picked.height.toFixed(2))
    window['$message'].success('已拾取模型位置')
  })
}
</script>

<style lang="scss" scoped>
.model-properties {
  width: 100%;
}
.coord-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
  width: 100%;
}
.meta {
  margin-top: 4px;
  font-size: 11px;
  color: #8ea6a1;
}
.pick-btn {
  margin-top: 8px;
}
.tip {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #7f9993;
}
</style>
