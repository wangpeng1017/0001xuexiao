<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    :auto-focus="false"
    @update:show="value => emit('update:show', value)"
  >
    <n-card class="add-layer-card" :bordered="false" title="新增图层">
      <div class="layer-name-row">
        <span class="layer-name-label">图层名称</span>
        <n-input
          v-model:value="activeDraft.name"
          size="small"
          placeholder="请输入图层名称"
          data-testid="add-layer-name"
        />
      </div>

      <n-tabs v-model:value="activeType" type="line" size="small" animated class="layer-type-tabs">
        <n-tab-pane v-for="type in types" :key="type" :name="type" :tab="typeLabels[type]" />
      </n-tabs>

      <div class="layer-form-wrap">
        <component :is="formMap[activeType]" :draft="activeDraft" :key="activeType" />
      </div>

      <template #footer>
        <div class="modal-footer">
          <n-button size="small" @click="emit('update:show', false)">取消</n-button>
          <n-button
            size="small"
            type="primary"
            data-testid="add-layer-submit"
            @click="handleSubmit"
          >
            添加图层
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { LAYER_TYPE_NAMES, nextLayerName } from '../defaults'
import { LayerDraft, Scene3DOption, SceneLayer, SceneLayerType } from '../types'
import { createDraft, draftToLayer } from './draft'
import RasterForm from './forms/RasterForm.vue'
import VectorForm from './forms/VectorForm.vue'
import ModelForm from './forms/ModelForm.vue'
import ServiceForm from './forms/ServiceForm.vue'
import PanoramaForm from './forms/PanoramaForm.vue'

const props = defineProps<{
  show: boolean
  optionData: Scene3DOption
  defaultSetId?: string
}>()

const emit = defineEmits(['update:show', 'submit'])

const types: SceneLayerType[] = ['raster', 'vector', 'model', 'service', 'panorama']
const typeLabels: Record<SceneLayerType, string> = {
  raster: '栅格',
  vector: '矢量',
  model: '三维模型',
  service: '在线地图服务',
  panorama: '360 街景'
}
const formMap = {
  raster: RasterForm,
  vector: VectorForm,
  model: ModelForm,
  service: ServiceForm,
  panorama: PanoramaForm
}

const activeType = ref<SceneLayerType>('raster')
const drafts = reactive({} as Record<SceneLayerType, LayerDraft>)

const activeDraft = computed(() => drafts[activeType.value])

const resetDrafts = () => {
  for (const type of types) {
    drafts[type] = createDraft(type, nextLayerName(props.optionData.layerSets || [], LAYER_TYPE_NAMES[type]))
  }
  activeType.value = 'raster'
}

const handleSubmit = () => {
  const draft = activeDraft.value
  if (!draft) return
  if (!draft.name.trim()) {
    window['$message'].warning('请填写图层名称')
    return
  }
  const type = draft.type
  if (type !== 'panorama' && !(draft.source.url || '').trim()) {
    window['$message'].warning('请选择数据或填写图层地址')
    return
  }
  if (type === 'panorama') {
    const points = (draft.source.points || []).filter(point => point.name && point.imageUrl)
    if (!points.length) {
      window['$message'].warning('请填写街景点的名称并选择全景图')
      return
    }
    draft.source.points = points
  }
  const layer: SceneLayer = draftToLayer(draft)
  emit('submit', {
    setId: props.defaultSetId || props.optionData.layerSets?.[0]?.id || '',
    layer
  })
  emit('update:show', false)
}

watch(
  () => props.show,
  value => {
    if (value) resetDrafts()
  },
  { immediate: true }
)
</script>

<style lang="scss" scoped>
.add-layer-card {
  width: 820px;
  max-width: calc(100vw - 40px);
}
.layer-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.layer-name-label {
  flex-shrink: 0;
  width: 68px;
  font-size: 13px;
  color: #b9d4cd;
}
.layer-type-tabs {
  margin-bottom: 4px;
}
.layer-form-wrap {
  max-height: 58vh;
  overflow-y: auto;
  padding: 6px 4px 2px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
