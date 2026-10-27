<template>
  <n-form size="small" label-placement="left" label-width="92" class="layer-form">
    <n-form-item label="来源">
      <n-radio-group v-model:value="draft.source.from" size="small" data-testid="vector-source-mode">
        <n-radio-button value="datafile">数据文件</n-radio-button>
        <n-radio-button value="material">素材库</n-radio-button>
        <n-radio-button value="url">直接填写地址</n-radio-button>
      </n-radio-group>
    </n-form-item>
    <n-form-item v-if="draft.source.from === 'datafile'" label="数据文件">
      <data-source-picker from="datafile" :datafile-kind="['vector']" @select="handleSelect" />
    </n-form-item>
    <n-form-item v-else-if="draft.source.from === 'material'" label="地图素材">
      <data-source-picker
        from="material"
        material-category="map"
        material-filter="geojson"
        @select="handleSelect"
      />
    </n-form-item>
    <n-form-item v-else label="GeoJSON 地址">
      <n-input
        v-model:value="draft.source.url"
        placeholder="/static/samples/sample.geojson"
        data-testid="vector-url"
      />
    </n-form-item>

    <n-form-item label="填充颜色">
      <n-color-picker v-model:value="draft.style.fill" size="small" :show-alpha="false" />
    </n-form-item>
    <n-form-item label="边线颜色">
      <n-color-picker v-model:value="draft.style.stroke" size="small" :show-alpha="false" />
    </n-form-item>
    <n-form-item label="线宽">
      <n-input-number v-model:value="draft.style.strokeWidth" size="small" :min="1" :max="20" />
    </n-form-item>
    <n-form-item label="点颜色">
      <n-color-picker v-model:value="draft.style.pointColor" size="small" :show-alpha="false" />
    </n-form-item>
    <n-form-item label="拉伸成立体">
      <n-switch v-model:value="draft.style.extrude" size="small" />
      <n-text depth="3" class="extrude-hint">按要素的 height 属性（米）拉伸，仅对面要素有效</n-text>
    </n-form-item>
    <n-form-item v-if="draft.style.extrude" label="拉伸倍数">
      <n-input-number v-model:value="draft.style.extrudeScale" size="small" :min="0.1" :max="20" :step="0.5" />
    </n-form-item>
  </n-form>
</template>

<script setup lang="ts">
import { NRadioButton } from 'naive-ui'
import { LayerDraft } from '../../types'
import DataSourcePicker from '../DataSourcePicker.vue'

const props = defineProps<{
  draft: LayerDraft
}>()

const handleSelect = (payload: { url: string; refId: string }) => {
  props.draft.source.url = payload.url
  props.draft.source.refId = payload.refId
}
</script>

<style scoped>
.extrude-hint {
  margin-left: 8px;
  font-size: 12px;
}
</style>
