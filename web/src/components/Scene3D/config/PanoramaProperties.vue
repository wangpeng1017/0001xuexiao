<template>
  <div class="panorama-properties">
    <setting-item-box name="已有街景点">
      <div v-if="!points.length" class="empty-tip">暂无点位，请在下方添加</div>
      <div v-for="(point, index) in points" :key="point.id" class="point-row" data-testid="panorama-point-row">
        <img v-if="point.imageUrl" class="point-thumb" :src="point.imageUrl" alt="全景图" />
        <div class="point-info">
          <div class="point-name">{{ index + 1 }}. {{ point.name }}</div>
          <div class="point-coord">{{ Number(point.lon).toFixed(5) }}, {{ Number(point.lat).toFixed(5) }}</div>
        </div>
        <button class="point-delete" type="button" @click="removePoint(index)">删除</button>
      </div>
    </setting-item-box>

    <setting-item-box name="新增点位">
      <setting-item name="名称">
        <n-input v-model:value="draft.name" size="small" placeholder="街景点名称" data-testid="panorama-new-name" />
      </setting-item>
      <div class="coord-grid">
        <setting-item name="经度">
          <n-input-number v-model:value="draft.lon" size="small" :precision="6" :step="0.0001" data-testid="panorama-new-lon" />
        </setting-item>
        <setting-item name="纬度">
          <n-input-number v-model:value="draft.lat" size="small" :precision="6" :step="0.0001" data-testid="panorama-new-lat" />
        </setting-item>
      </div>
      <setting-item name="全景图">
        <div class="image-input-row">
          <n-input v-model:value="draft.imageUrl" size="small" placeholder="全景图地址" data-testid="panorama-new-image" />
          <n-button size="small" :loading="uploading" @click="triggerUpload">上传</n-button>
          <input ref="fileInputRef" type="file" accept="image/*" class="hidden-file" @change="handleFileChange" />
        </div>
      </setting-item>
      <data-source-picker
        from="material"
        material-category="image2d"
        material-filter="image"
        @select="payload => (draft.imageUrl = payload.url)"
      />
      <img v-if="draft.imageUrl" class="point-preview" :src="draft.imageUrl" alt="全景图预览" />

      <n-space :size="6" class="point-actions">
        <n-button size="small" ghost data-testid="panorama-pick" @click="pickCoords">拾取坐标</n-button>
        <n-button size="small" type="primary" ghost data-testid="panorama-pick-add" @click="pickAndAdd">
          地图点选并添加
        </n-button>
        <n-button size="small" data-testid="panorama-add-point" @click="addPoint">添加点位</n-button>
      </n-space>
      <div class="tip">“地图点选并添加”会先收起面板遮挡，在地图上单击位置后自动添加点位并打开全景图入口。</div>
    </setting-item-box>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { getUUID } from '@/utils'
import { uploadImage } from '../api'
import { getSceneController } from '../registry'
import { PanoramaPoint, Scene3DOption, SceneLayer } from '../types'
import { SettingItem, SettingItemBox } from '@/components/Pages/ChartItemSetting'
import DataSourcePicker from './DataSourcePicker.vue'

const props = defineProps<{
  optionData: Scene3DOption
  layer: SceneLayer
}>()

if (!props.layer.source.points) props.layer.source.points = []
const points = props.layer.source.points

const draft = reactive({
  name: `街景点 ${points.length + 1}`,
  lon: points[0]?.lon ?? 116.3913,
  lat: points[0]?.lat ?? 39.9075,
  imageUrl: ''
})

const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

const triggerUpload = () => fileInputRef.value?.click()

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  const url = await uploadImage(file)
  uploading.value = false
  input.value = ''
  if (url) draft.imageUrl = url
  else window['$message'].error('全景图上传失败')
}

const validateDraft = () => {
  if (!draft.name.trim()) {
    window['$message'].warning('请填写点位名称')
    return false
  }
  if (!draft.imageUrl.trim()) {
    window['$message'].warning('请选择或上传全景图')
    return false
  }
  return true
}

const resetDraft = () => {
  draft.name = `街景点 ${points.length + 1}`
  draft.imageUrl = ''
}

const pushPoint = () => {
  const point: PanoramaPoint = {
    id: getUUID(),
    name: draft.name.trim(),
    lon: Number(Number(draft.lon).toFixed(6)),
    lat: Number(Number(draft.lat).toFixed(6)),
    imageUrl: draft.imageUrl.trim()
  }
  points.push(point)
  resetDraft()
  window['$message'].success('已添加街景点')
}

const addPoint = () => {
  if (validateDraft()) pushPoint()
}

const pickCoords = () => {
  const controller = getSceneController(props.optionData)
  if (!controller || !controller.isReady()) {
    window['$message'].warning('三维场景尚未就绪')
    return
  }
  window['$message'].info('请在地图上单击街景位置')
  controller.startPickPosition(position => {
    draft.lon = Number(position.lon.toFixed(6))
    draft.lat = Number(position.lat.toFixed(6))
    window['$message'].success('已拾取坐标')
  })
}

const pickAndAdd = () => {
  if (!validateDraft()) return
  const controller = getSceneController(props.optionData)
  if (!controller || !controller.isReady()) {
    window['$message'].warning('三维场景尚未就绪')
    return
  }
  window['$message'].info('请在地图上单击街景位置')
  controller.startPickPosition(position => {
    draft.lon = Number(position.lon.toFixed(6))
    draft.lat = Number(position.lat.toFixed(6))
    pushPoint()
  })
}

const removePoint = (index: number) => {
  points.splice(index, 1)
}
</script>

<style lang="scss" scoped>
.panorama-properties {
  width: 100%;
}
.empty-tip {
  font-size: 11px;
  color: #8ea6a1;
}
.point-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}
.point-thumb {
  width: 44px;
  height: 28px;
  object-fit: cover;
  border-radius: 3px;
}
.point-info {
  flex: 1;
  min-width: 0;
}
.point-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #d7ebe6;
}
.point-coord {
  font-size: 10px;
  color: #8ea6a1;
}
.point-delete {
  flex-shrink: 0;
  font-size: 11px;
  color: #e07a7a;
  cursor: pointer;
  background: transparent;
  border: none;
}
.coord-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
  width: 100%;
}
.image-input-row {
  display: flex;
  gap: 6px;
  width: 100%;
}
.hidden-file {
  display: none;
}
.point-preview {
  width: 100%;
  height: 70px;
  object-fit: cover;
  margin-top: 6px;
  border: 1px solid rgba(81, 214, 169, 0.35);
  border-radius: 4px;
}
.point-actions {
  margin-top: 8px;
  width: 100%;
}
.tip {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #7f9993;
}
</style>
