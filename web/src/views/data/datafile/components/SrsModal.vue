<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    title="选择坐标系"
    style="width: 540px; max-width: 94vw"
    :bordered="false"
  >
    <div class="srs-modal">
      <p class="srs-file" v-if="fileName">{{ fileName }}</p>
      <p class="srs-tip">
        LAS/LAZ 文件头中能读到坐标系时会自动使用；读不到时请在这里指定，否则转换会失败。
      </p>
      <n-radio-group v-model:value="mode">
        <n-space>
          <n-radio value="preset">从预置列表选择</n-radio>
          <n-radio value="custom">自定义 EPSG</n-radio>
        </n-space>
      </n-radio-group>
      <n-select
        v-if="mode === 'preset'"
        v-model:value="presetValue"
        :options="options"
        filterable
        placeholder="选择坐标系"
      />
      <n-input
        v-else
        v-model:value="customValue"
        placeholder="例如 EPSG:4547"
        @keyup.enter="handleConfirm"
      />
      <p class="srs-note">预置为 CGCS2000 高斯-克吕格投影带，若数据为其他坐标系请选择自定义。</p>
    </div>
    <template #footer>
      <n-space justify="end">
        <n-button @click="visible = false">取消</n-button>
        <n-button type="primary" @click="handleConfirm">确定</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SelectOption } from 'naive-ui'

const props = defineProps<{
  show: boolean
  fileName?: string
  defaultSrs?: string
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'confirm', srs?: string): void
}>()

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})

const mode = ref<'preset' | 'custom'>('preset')
const presetValue = ref('auto')
const customValue = ref('')

const threeDegree: SelectOption[] = Array.from({ length: 21 }, (_, index) => {
  const zone = 25 + index
  return {
    label: `3 度带 第 ${zone} 带（中央经线 ${zone * 3}°E）EPSG:${4513 + index}`,
    value: `EPSG:${4513 + index}`
  }
})
const sixDegree: SelectOption[] = Array.from({ length: 11 }, (_, index) => {
  const zone = 13 + index
  return {
    label: `6 度带 第 ${zone} 带（中央经线 ${zone * 6 - 3}°E）EPSG:${4491 + index}`,
    value: `EPSG:${4491 + index}`
  }
})

const options: SelectOption[] = [
  {
    type: 'group',
    label: '常用',
    key: 'common',
    children: [
      { label: '自动读取（从 LAS 文件头）', value: 'auto' },
      { label: 'EPSG:4326 WGS 84', value: 'EPSG:4326' },
      { label: 'EPSG:4490 CGCS2000 地理坐标', value: 'EPSG:4490' }
    ]
  },
  { type: 'group', label: 'CGCS2000 3 度带', key: 'cgcs2000-3', children: threeDegree },
  { type: 'group', label: 'CGCS2000 6 度带', key: 'cgcs2000-6', children: sixDegree }
]

const knownCodes = new Set(
  options.flatMap((option) => ('children' in option ? (option.children ?? []) : [option])).map((item) => item.value)
)

watch(
  () => props.show,
  (show) => {
    if (!show) return
    const srs = props.defaultSrs || ''
    if (!srs) {
      mode.value = 'preset'
      presetValue.value = 'auto'
      return
    }
    if (knownCodes.has(srs)) {
      mode.value = 'preset'
      presetValue.value = srs
    } else {
      mode.value = 'custom'
      customValue.value = srs
    }
  },
  { immediate: true }
)

function handleConfirm() {
  if (mode.value === 'preset') {
    emit('confirm', presetValue.value === 'auto' ? undefined : presetValue.value)
    visible.value = false
    return
  }
  const raw = customValue.value.trim()
  const match = /^(?:EPSG:)?(\d{4,6})$/i.exec(raw)
  if (!match) {
    window['$message'].error('请输入有效的 EPSG 编号，例如 EPSG:4547')
    return
  }
  emit('confirm', `EPSG:${match[1]}`)
  visible.value = false
}
</script>

<style lang="scss" scoped>
.srs-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  .srs-file {
    margin: 0;
    font-weight: 600;
    word-break: break-all;
  }
  .srs-tip,
  .srs-note {
    margin: 0;
    color: #8a8f99;
    font-size: 12px;
    line-height: 1.6;
  }
}
</style>
