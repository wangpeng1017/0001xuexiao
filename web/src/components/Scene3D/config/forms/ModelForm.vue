<template>
  <n-form size="small" label-placement="left" label-width="108" class="layer-form">
    <n-form-item label="来源">
      <n-radio-group v-model:value="draft.source.from" size="small" data-testid="model-source-mode">
        <n-radio-button value="material">素材库</n-radio-button>
        <n-radio-button value="datafile">数据文件</n-radio-button>
        <n-radio-button value="url">直接填写地址</n-radio-button>
      </n-radio-group>
    </n-form-item>
    <n-form-item v-if="draft.source.from === 'material'" label="模型素材">
      <data-source-picker
        from="material"
        material-category="model"
        material-filter="model"
        @select="handleMaterialSelect"
      />
    </n-form-item>
    <n-form-item v-else-if="draft.source.from === 'datafile'" label="数据文件">
      <data-source-picker
        from="datafile"
        :datafile-kind="['pointcloud', 'tiles3d']"
        @select="handleDatafileSelect"
      />
    </n-form-item>
    <template v-else>
      <n-form-item label="模型 / Tiles 地址">
        <n-input
          v-model:value="draft.source.url"
          placeholder="/static/samples/sample-cube.gltf 或 /files/datafiles/.../3dtiles/tileset.json"
          data-testid="model-url"
          @update:value="handleUrlInput"
        />
      </n-form-item>
      <n-form-item label="数据格式">
        <n-select
          v-model:value="draft.source.format"
          :options="formatOptions"
          data-testid="model-format"
          @update:value="handleFormatChange"
        />
      </n-form-item>
    </template>

    <n-divider title-placement="left" class="form-divider">{{ formatLabel }}</n-divider>
    <div class="field-grid">
      <n-form-item :label="offsetMode ? '经度偏移(度)' : '经度'">
        <n-input-number v-model:value="position.lon" size="small" :precision="6" :step="offsetMode ? 0.0001 : 0.001" />
      </n-form-item>
      <n-form-item :label="offsetMode ? '纬度偏移(度)' : '纬度'">
        <n-input-number v-model:value="position.lat" size="small" :precision="6" :step="offsetMode ? 0.0001 : 0.001" />
      </n-form-item>
      <n-form-item :label="offsetMode ? '高度偏移(米)' : '高度(米)'">
        <n-input-number v-model:value="position.height" size="small" :step="10" />
      </n-form-item>
      <n-form-item label="缩放">
        <n-input-number v-model:value="draft.source.scale" size="small" :min="0.0001" :step="0.1" />
      </n-form-item>
    </div>

    <template v-if="!offsetMode">
      <div class="field-grid">
        <n-form-item label="朝向 Heading">
          <n-input-number v-model:value="rotation.heading" size="small" :step="5" />
        </n-form-item>
        <n-form-item label="俯仰 Pitch">
          <n-input-number v-model:value="rotation.pitch" size="small" :step="5" />
        </n-form-item>
        <n-form-item label="翻滚 Roll">
          <n-input-number v-model:value="rotation.roll" size="small" :step="5" />
        </n-form-item>
      </div>
    </template>

    <template v-if="offsetMode">
      <div class="field-grid">
        <n-form-item label="点大小">
          <n-input-number v-model:value="draft.style.pointSize" size="small" :min="0.5" :step="0.5" />
        </n-form-item>
        <n-form-item label="着色方式">
          <n-select
            v-model:value="draft.style.colorBy"
            size="small"
            :options="[
              { label: '按 RGB', value: 'rgb' },
              { label: '按高程', value: 'height' }
            ]"
          />
        </n-form-item>
      </div>
      <n-alert type="info" :bordered="false" :show-icon="false" class="form-tip">
        点云按高程着色使用 3D Tiles 样式表达式；3D Tiles 类型的经纬度、高度表示整体偏移。
      </n-alert>
    </template>
    <n-alert v-else type="info" :bordered="false" :show-icon="false" class="form-tip">
      添加图层后，可在“图层属性”中点击“拾取位置”，在地图上单击摆放模型。
    </n-alert>
  </n-form>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NRadioButton } from 'naive-ui'
import { DataFileItem, LayerDraft, MaterialItem } from '../../types'
import DataSourcePicker from '../DataSourcePicker.vue'

const props = defineProps<{
  draft: LayerDraft
}>()

if (!props.draft.source.position) {
  props.draft.source.position = { lon: 0, lat: 0, height: 0 }
}
if (!props.draft.source.rotation) {
  props.draft.source.rotation = { heading: 0, pitch: 0, roll: 0 }
}
if (props.draft.source.scale === undefined) props.draft.source.scale = 1

const position = props.draft.source.position
const rotation = props.draft.source.rotation

const formatOptions = [
  { label: 'glTF / GLB', value: 'gltf' },
  { label: '3D Tiles（点云 / 倾斜摄影）', value: '3dtiles' }
]

const offsetMode = computed(() => props.draft.source.format === '3dtiles')
const formatLabel = computed(() => (offsetMode.value ? '整体偏移与点云样式' : '位置、姿态与缩放'))

const resetOffset = () => {
  position.lon = 0
  position.lat = 0
  position.height = 0
}

const handleMaterialSelect = (payload: { url: string; refId: string }) => {
  props.draft.source.url = payload.url
  props.draft.source.refId = payload.refId
  props.draft.source.format = 'gltf'
}

const handleDatafileSelect = (payload: { url: string; refId: string; item: DataFileItem | MaterialItem }) => {
  props.draft.source.url = payload.url
  props.draft.source.refId = payload.refId
  props.draft.source.format = '3dtiles'
  resetOffset()
  if ('kind' in payload.item && payload.item.kind === 'pointcloud') {
    props.draft.style.pointSize = props.draft.style.pointSize || 2
    props.draft.style.colorBy = props.draft.style.colorBy || 'rgb'
  }
}

const handleUrlInput = (value: string) => {
  if (/tileset\.json(\?|$)/i.test(value)) {
    if (props.draft.source.format !== '3dtiles') {
      props.draft.source.format = '3dtiles'
      resetOffset()
    }
  } else if (/\.(glb|gltf)(\?|$)/i.test(value)) {
    props.draft.source.format = 'gltf'
  }
}

const handleFormatChange = (value: string) => {
  if (value === '3dtiles') resetOffset()
}
</script>
