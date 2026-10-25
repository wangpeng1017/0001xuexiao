<template>
  <div class="layer-properties">
    <setting-item-box name="基础属性">
      <setting-item name="名称">
        <n-input v-model:value="layer.name" size="small" data-testid="layer-name-input" />
      </setting-item>
      <setting-item name="类型">
        <span class="type-text">{{ typeName }}</span>
      </setting-item>
      <setting-item name="透明度">
        <div class="opacity-row">
          <n-slider
            v-model:value="layer.opacity"
            :min="0"
            :max="1"
            :step="0.05"
            class="opacity-slider"
            data-testid="layer-opacity"
          />
          <span class="opacity-value">{{ opacityPercent }}%</span>
        </div>
      </setting-item>
      <setting-item name="显隐">
        <n-switch v-model:value="layer.visible" size="small" />
      </setting-item>
    </setting-item-box>

    <setting-item-box v-if="layer.type === 'raster' || layer.type === 'service'" name="数据来源">
      <setting-item name="地址" alone>
        <n-input v-model:value="layer.source.url" size="small" placeholder="图层地址" data-testid="layer-source-url" />
      </setting-item>
      <template v-if="layer.type === 'service'">
        <setting-item name="产品">
          <span class="type-text">{{ productName }}</span>
        </setting-item>
        <setting-item name="协议">
          <span class="type-text">{{ layer.source.protocol || 'xyz' }}</span>
        </setting-item>
        <template v-if="layer.source.protocol === 'wms' || layer.source.protocol === 'wmts'">
          <setting-item name="图层名">
            <n-input v-model:value="layer.source.layers" size="small" placeholder="layers" />
          </setting-item>
          <setting-item name="样式">
            <n-input v-model:value="layer.source.style" size="small" placeholder="style" />
          </setting-item>
          <setting-item name="格式">
            <n-input v-model:value="layer.source.format" size="small" placeholder="image/png" />
          </setting-item>
          <setting-item v-if="layer.source.protocol === 'wmts'" name="矩阵集">
            <n-input v-model:value="layer.source.tileMatrixSet" size="small" placeholder="EPSG:4326" />
          </setting-item>
        </template>
      </template>
    </setting-item-box>

    <setting-item-box v-if="layer.type === 'vector'" name="矢量地址与样式">
      <setting-item name="地址" alone>
        <n-input v-model:value="layer.source.url" size="small" placeholder="GeoJSON 地址" />
      </setting-item>
      <setting-item name="填充色">
        <n-color-picker v-model:value="layer.style.fill" size="small" :show-alpha="false" />
      </setting-item>
      <setting-item name="边线色">
        <n-color-picker v-model:value="layer.style.stroke" size="small" :show-alpha="false" />
      </setting-item>
      <setting-item name="线宽">
        <n-input-number v-model:value="layer.style.strokeWidth" size="small" :min="1" :max="20" />
      </setting-item>
      <setting-item name="点颜色">
        <n-color-picker v-model:value="layer.style.pointColor" size="small" :show-alpha="false" />
      </setting-item>
    </setting-item-box>

    <model-properties
      v-if="layer.type === 'model'"
      :key="layer.id"
      :option-data="optionData"
      :layer="layer"
    />
    <panorama-properties
      v-if="layer.type === 'panorama'"
      :key="layer.id"
      :option-data="optionData"
      :layer="layer"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { LAYER_TYPE_NAMES } from '../defaults'
import { findGisProduct, Scene3DOption, SceneLayer } from '../types'
import { SettingItem, SettingItemBox } from '@/components/Pages/ChartItemSetting'
import ModelProperties from './ModelProperties.vue'
import PanoramaProperties from './PanoramaProperties.vue'

const props = defineProps<{
  optionData: Scene3DOption
  layer: SceneLayer
}>()

const typeName = computed(() => LAYER_TYPE_NAMES[props.layer.type])
const productName = computed(() => findGisProduct(props.layer.source.product).label)
const opacityPercent = computed(() => Math.round((Number(props.layer.opacity) || 0) * 100))
</script>

<style lang="scss" scoped>
.layer-properties {
  width: 100%;
}
.type-text {
  font-size: 12px;
  color: #b9d4cd;
}
.opacity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.opacity-slider {
  flex: 1;
}
.opacity-value {
  flex-shrink: 0;
  width: 34px;
  font-size: 11px;
  color: #8ea6a1;
  text-align: right;
}
</style>
