<template>
  <div class="layer-tree">
    <div class="tree-toolbar">
      <span class="tree-count">图层集 {{ optionData.layerSets.length }} 个 / 图层 {{ layerCount }} 个</span>
      <n-button size="tiny" dashed @click="addLayerSet" data-testid="scene-add-set">新建图层集</n-button>
    </div>

    <div v-for="set in optionData.layerSets" :key="set.id" class="layer-set" data-testid="scene-layer-set">
      <div class="set-row" @mousedown.stop>
        <n-checkbox v-model:checked="set.visible" size="small" :title="set.visible ? '隐藏整组' : '显示整组'" />
        <n-input v-model:value="set.name" size="tiny" class="set-name" placeholder="图层集名称" data-testid="scene-set-name" />
        <n-button text size="tiny" class="set-action" data-testid="scene-add-layer" @click="emit('add-layer', set.id)">
          + 图层
        </n-button>
        <n-popconfirm @positive-click="removeLayerSet(set.id)">
          <template #trigger>
            <n-button text size="tiny" class="set-action danger">删除</n-button>
          </template>
          删除图层集及其中所有图层？
        </n-popconfirm>
      </div>

      <draggable
        v-model="set.layers"
        item-key="id"
        group="scene-layers"
        handle=".layer-drag"
        ghost-class="layer-ghost"
        :animation="150"
        class="layer-list"
      >
        <template #item="{ element }">
          <div
            class="layer-row"
            :class="{ selected: element.id === selectedId }"
            :data-layer-id="element.id"
            @click="selectLayer(element.id)"
          >
            <span class="layer-drag" title="拖拽排序 / 可跨图层集拖动">⣿</span>
            <n-checkbox
              v-model:checked="element.visible"
              size="small"
              title="显示 / 隐藏图层"
              @click.stop
            />
            <span class="layer-name" :title="element.name">{{ element.name }}</span>
            <span class="layer-type">{{ typeShort[element.type] }}</span>
            <button class="layer-action" type="button" title="定位到图层" @click.stop="locateLayer(element)">
              定位
            </button>
            <n-popconfirm @positive-click="removeLayer(set, element.id)">
              <template #trigger>
                <button class="layer-action danger" type="button" @click.stop>删除</button>
              </template>
              删除图层“{{ element.name }}”？
            </n-popconfirm>
          </div>
        </template>
      </draggable>
      <div v-if="!set.layers.length" class="empty-layers">暂无图层</div>
    </div>

    <n-empty v-if="!optionData.layerSets.length" size="small" description="请先新建图层集" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NPopconfirm } from 'naive-ui'
import Draggable from 'vuedraggable'
import { getSceneController } from '../registry'
import { createLayerSet, nextLayerSetName } from '../defaults'
import { Scene3DOption, SceneLayer, SceneLayerSet } from '../types'

const props = defineProps<{
  optionData: Scene3DOption
  selectedId?: string
}>()

const emit = defineEmits(['add-layer', 'select'])

const typeShort: Record<string, string> = {
  raster: '栅格',
  vector: '矢量',
  model: '模型',
  service: '服务',
  panorama: '街景'
}

const layerCount = computed(() =>
  props.optionData.layerSets.reduce((total, set) => total + set.layers.length, 0)
)

const addLayerSet = () => {
  props.optionData.layerSets.push(createLayerSet(nextLayerSetName(props.optionData.layerSets)))
}

const removeLayerSet = (setId: string) => {
  const index = props.optionData.layerSets.findIndex(set => set.id === setId)
  if (index === -1) return
  const set = props.optionData.layerSets[index]
  const selectedInSet = set.layers.some(layer => layer.id === props.selectedId)
  props.optionData.layerSets.splice(index, 1)
  if (selectedInSet) emit('select', '')
}

const removeLayer = (set: SceneLayerSet, layerId: string) => {
  const index = set.layers.findIndex(layer => layer.id === layerId)
  if (index === -1) return
  set.layers.splice(index, 1)
  if (props.selectedId === layerId) emit('select', '')
}

const selectLayer = (layerId: string) => {
  emit('select', layerId)
}

const locateLayer = (layer: SceneLayer) => {
  const controller = getSceneController(props.optionData)
  if (!controller) {
    window['$message'].warning('三维场景尚未就绪')
    return
  }
  if (!controller.flyToLayer(layer.id)) {
    window['$message'].warning('图层尚未加载完成，无法定位')
  }
}
</script>

<style lang="scss" scoped>
.layer-tree {
  width: 100%;
}
.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.tree-count {
  font-size: 11px;
  color: #8ea6a1;
}
.layer-set {
  margin-bottom: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}
.set-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.05);
}
.set-name {
  flex: 1;
  min-width: 0;
}
.set-action {
  flex-shrink: 0;
  font-size: 11px;
  &.danger {
    color: #e07a7a;
  }
}
.layer-list {
  min-height: 8px;
}
.layer-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  cursor: pointer;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  &:hover {
    background: rgba(81, 214, 169, 0.08);
  }
  &.selected {
    background: rgba(81, 214, 169, 0.16);
  }
}
.layer-drag {
  flex-shrink: 0;
  color: #708a85;
  cursor: grab;
  font-size: 12px;
  letter-spacing: -2px;
}
.layer-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #d7ebe6;
}
.layer-type {
  flex-shrink: 0;
  padding: 0 4px;
  font-size: 10px;
  color: #84b8aa;
  border: 1px solid rgba(81, 214, 169, 0.28);
  border-radius: 3px;
}
.layer-action {
  flex-shrink: 0;
  padding: 0 3px;
  font-size: 10px;
  color: #8ea6a1;
  cursor: pointer;
  background: transparent;
  border: none;
  &:hover {
    color: #51d6a9;
  }
  &.danger:hover {
    color: #e07a7a;
  }
}
.empty-layers {
  padding: 6px 10px;
  font-size: 11px;
  color: #708a85;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}
.layer-ghost {
  opacity: 0.35;
  background: rgba(81, 214, 169, 0.2);
}
</style>
