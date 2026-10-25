<template>
  <div class="data-source-picker">
    <n-select
      v-model:value="selected"
      size="small"
      :options="options"
      :loading="loading"
      :placeholder="placeholder"
      :disabled="unavailable || !options.length"
      data-testid="data-source-select"
      @update:value="handleSelect"
    />
    <div v-if="loading" class="picker-tip">加载中…</div>
    <div v-else-if="unavailable" class="picker-tip warn">暂无可用数据（接口不可用），请改用“直接填写地址”</div>
    <div v-else-if="!options.length" class="picker-tip warn">暂无可用数据，请改用“直接填写地址”</div>
    <div v-else class="picker-tip">共 {{ options.length }} 条可选数据</div>
  </div>
</template>

<script setup lang="ts">
import { computed, PropType, ref, watch } from 'vue'
import { fetchDataFileList, fetchMaterialList } from '../api'
import { DataFileItem, MaterialItem } from '../types'

type MaterialFilter = 'geojson' | 'tiles' | 'model' | 'image' | 'none'
interface PickerOption {
  label: string
  value: string
  url: string
  refId: string
  item: DataFileItem | MaterialItem
}

const props = defineProps({
  from: {
    type: String as PropType<'datafile' | 'material'>,
    default: 'datafile'
  },
  datafileKind: {
    type: [String, Array] as PropType<string | string[]>,
    default: 'raster'
  },
  materialCategory: {
    type: String,
    default: 'map'
  },
  materialFilter: {
    type: String as PropType<MaterialFilter>,
    default: 'none'
  }
})

const emit = defineEmits(['select'])
const options = ref<PickerOption[]>([])
const loading = ref(false)
const unavailable = ref(false)
const selected = ref<string | null>(null)

const placeholder = computed(() =>
  props.from === 'datafile' ? '从数据文件中选择' : '从素材库中选择'
)

const matchFilter = (url: string) => {
  switch (props.materialFilter) {
    case 'geojson':
      return /\.geojson(\?|$)/i.test(url)
    case 'tiles':
      return url.includes('{z}') || /\/tiles\//i.test(url)
    case 'model':
      return /\.(glb|gltf)(\?|$)/i.test(url)
    case 'image':
      return /\.(png|jpe?g|svg|gif|webp)(\?|$)/i.test(url)
    default:
      return true
  }
}

const loadDataFiles = async () => {
  const kinds = Array.isArray(props.datafileKind) ? props.datafileKind : [props.datafileKind]
  const results = await Promise.all(kinds.filter(Boolean).map(kind => fetchDataFileList(kind)))
  if (results.every(result => result === null)) {
    unavailable.value = true
    return []
  }
  const list: DataFileItem[] = []
  for (const result of results) {
    if (result) list.push(...result.filter(item => item.status === 'success' && item.outputUrl))
  }
  return list.map(item => ({
    label: `${item.name}（${item.kind}）`,
    value: item.id,
    url: item.outputUrl,
    refId: item.id,
    item
  }))
}

const loadMaterials = async () => {
  const list = await fetchMaterialList(props.materialCategory)
  if (list === null) {
    unavailable.value = true
    return []
  }
  return list
    .filter(item => matchFilter(item.url || ''))
    .map(item => ({
      label: item.name,
      value: item.id,
      url: item.url,
      refId: item.id,
      item
    }))
}

const load = async () => {
  loading.value = true
  unavailable.value = false
  selected.value = null
  options.value = []
  try {
    options.value =
      props.from === 'datafile' ? await loadDataFiles() : await loadMaterials()
  } finally {
    loading.value = false
  }
}

const handleSelect = (value: string) => {
  const option = options.value.find(item => item.value === value)
  if (!option) return
  emit('select', {
    url: option.url,
    refId: option.refId,
    item: option.item
  })
}

watch(
  () => [props.from, props.datafileKind, props.materialCategory, props.materialFilter],
  load,
  { immediate: true, deep: true }
)
</script>

<style lang="scss" scoped>
.data-source-picker {
  width: 100%;
}
.picker-tip {
  margin-top: 4px;
  font-size: 11px;
  color: #8ea6a1;
  &.warn {
    color: #e6b566;
  }
}
</style>
