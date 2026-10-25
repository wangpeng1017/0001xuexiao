<template>
  <n-form size="small" label-placement="left" label-width="92" class="layer-form">
    <n-form-item label="来源">
      <n-radio-group v-model:value="draft.source.from" size="small" data-testid="raster-source-mode">
        <n-radio-button value="datafile">数据文件</n-radio-button>
        <n-radio-button value="material">素材库</n-radio-button>
        <n-radio-button value="url">直接填写地址</n-radio-button>
      </n-radio-group>
    </n-form-item>
    <n-form-item v-if="draft.source.from === 'datafile'" label="数据文件">
      <data-source-picker from="datafile" :datafile-kind="['raster']" @select="handleSelect" />
    </n-form-item>
    <n-form-item v-else-if="draft.source.from === 'material'" label="地图素材">
      <data-source-picker
        from="material"
        material-category="map"
        material-filter="tiles"
        @select="handleSelect"
      />
    </n-form-item>
    <n-form-item v-else label="XYZ 地址">
      <n-input
        v-model:value="draft.source.url"
        placeholder="/static/samples/xyz/{z}/{x}/{y}.png"
        data-testid="raster-url"
      />
    </n-form-item>
    <n-alert type="info" :bordered="false" :show-icon="false" class="form-tip">
      栅格图层使用 XYZ 瓦片加载；从数据文件或素材库选择后地址会自动填入。
    </n-alert>
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
