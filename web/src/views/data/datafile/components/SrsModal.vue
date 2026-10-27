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
        LAS/LAZ 文件头中能读到坐标系时会自动使用；读不到时请在这里指定，否则转换会失败。若点云本身是没有坐标系的局部米制坐标，请选择“局部/工程坐标”。
      </p>
      <n-radio-group v-model:value="mode">
        <n-space :wrap="true">
          <n-radio value="preset">从预置列表选择</n-radio>
          <n-radio value="custom">自定义 EPSG</n-radio>
          <n-radio value="local">局部/工程坐标（不重投影）</n-radio>
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
        v-else-if="mode === 'custom'"
        v-model:value="customValue"
        placeholder="例如 EPSG:4547"
        @keyup.enter="handleConfirm"
      />
      <div v-else class="local-fields">
        <label class="local-field">
          <span class="local-label">经度</span>
          <n-input-number v-model:value="lon" :min="-180" :max="180" placeholder="116.31" />
        </label>
        <label class="local-field">
          <span class="local-label">纬度</span>
          <n-input-number v-model:value="lat" :min="-90" :max="90" placeholder="40.00" />
        </label>
        <label class="local-field">
          <span class="local-label">高度（米）</span>
          <n-input-number v-model:value="height" placeholder="0" />
        </label>
      </div>
      <p class="srs-note" v-if="mode === 'local'">
        用于文件没有坐标系的点云，点云原点将放到该经纬度，X 轴向东、Y 轴向北、Z 轴向上。
      </p>
      <p class="srs-note" v-else>预置为 CGCS2000 高斯-克吕格投影带，若数据为其他坐标系请选择自定义。</p>
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
import { DEFAULT_LOCAL_ANCHOR, parseLocalAnchor, type LocalAnchor } from '../../types'

const props = defineProps<{
  show: boolean
  fileName?: string
  defaultSrs?: string
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'confirm', srs?: string, anchor?: LocalAnchor): void
}>()

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})

const mode = ref<'preset' | 'custom' | 'local'>('preset')
const presetValue = ref('auto')
const customValue = ref('')
const lon = ref<number | null>(DEFAULT_LOCAL_ANCHOR.lon)
const lat = ref<number | null>(DEFAULT_LOCAL_ANCHOR.lat)
const height = ref<number | null>(DEFAULT_LOCAL_ANCHOR.height)

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
    const anchor = srs ? parseLocalAnchor(srs) : null
    if (anchor) {
      mode.value = 'local'
      lon.value = anchor.lon
      lat.value = anchor.lat
      height.value = anchor.height
      return
    }
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
  if (mode.value === 'local') {
    if (lon.value === null || !Number.isFinite(lon.value) || lon.value < -180 || lon.value > 180) {
      window['$message'].error('请输入 -180 到 180 之间的经度')
      return
    }
    if (lat.value === null || !Number.isFinite(lat.value) || lat.value < -90 || lat.value > 90) {
      window['$message'].error('请输入 -90 到 90 之间的纬度')
      return
    }
    if (height.value === null || !Number.isFinite(height.value)) {
      window['$message'].error('请输入有效的高度（米）')
      return
    }
    emit('confirm', 'LOCAL', { lon: lon.value, lat: lat.value, height: height.value })
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
  .local-fields {
    display: flex;
    gap: 8px;
    .local-field {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 4px;
    }
    .local-label {
      color: #8a8f99;
      font-size: 12px;
    }
  }
}
</style>
