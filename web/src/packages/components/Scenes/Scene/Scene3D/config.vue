<template>
  <div class="scene3d-config">
    <collapse-item name="场景设置" :expanded="true">
      <camera-panel :option-data="optionData" />
    </collapse-item>

    <collapse-item name="图层树" :expanded="true">
      <layer-tree
        :option-data="optionData"
        :selected-id="selectedId"
        @add-layer="openAddLayer"
        @select="selectedId = $event"
      />
    </collapse-item>

    <collapse-item
      v-if="selectedLayer"
      :key="selectedLayer.id"
      :name="`图层属性 · ${selectedLayer.name}`"
      :expanded="true"
    >
      <layer-properties
        :option-data="optionData"
        :layer="selectedLayer"
        :key="selectedLayer.id"
      />
    </collapse-item>

    <add-layer-modal
      v-model:show="addLayerShow"
      :option-data="optionData"
      :default-set-id="addToSetId"
      @submit="handleAddLayer"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, PropType, ref } from 'vue'
import { CollapseItem } from '@/components/Pages/ChartItemSetting'
import { createLayerSet, DEFAULT_CAMERA } from '@/components/Scene3D/defaults'
import { Scene3DOption, SceneLayer, SceneLayerSet } from '@/components/Scene3D/types'
import CameraPanel from '@/components/Scene3D/config/CameraPanel.vue'
import LayerTree from '@/components/Scene3D/config/LayerTree.vue'
import LayerProperties from '@/components/Scene3D/config/LayerProperties.vue'
import AddLayerModal from '@/components/Scene3D/config/AddLayerModal.vue'

const props = defineProps({
  optionData: {
    type: Object as PropType<Scene3DOption>,
    required: true
  }
})

if (!Array.isArray(props.optionData.layerSets)) props.optionData.layerSets = []
if (!props.optionData.layerSets.length) {
  props.optionData.layerSets.push(createLayerSet('默认图层集'))
}
if (!props.optionData.camera) props.optionData.camera = { ...DEFAULT_CAMERA }
if (!props.optionData.sceneMode) props.optionData.sceneMode = '3D'
if (!props.optionData.baseLayer) props.optionData.baseLayer = 'naturalEarth'

const selectedId = ref('')
const addLayerShow = ref(false)
const addToSetId = ref('')

const selectedLayer = computed(() => {
  for (const set of props.optionData.layerSets) {
    const layer = set.layers.find(item => item.id === selectedId.value)
    if (layer) return layer
  }
  return undefined
})

const openAddLayer = (setId: string) => {
  addToSetId.value = setId
  addLayerShow.value = true
}

const handleAddLayer = (payload: { setId: string; layer: SceneLayer }) => {
  let target: SceneLayerSet | undefined = props.optionData.layerSets.find(
    set => set.id === payload.setId
  )
  if (!target) target = props.optionData.layerSets[0]
  if (!target) return
  target.layers.push(payload.layer)
  selectedId.value = payload.layer.id
}
</script>

<style lang="scss" scoped>
.scene3d-config {
  width: 100%;
}
</style>
