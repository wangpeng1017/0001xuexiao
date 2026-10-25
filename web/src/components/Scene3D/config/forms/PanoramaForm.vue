<template>
  <n-form size="small" label-placement="left" label-width="92" class="layer-form">
    <n-form-item label="点位名称">
      <n-input v-model:value="point.name" placeholder="例如：图书馆门前" data-testid="panorama-point-name" />
    </n-form-item>
    <n-form-item label="经纬度">
      <div class="field-grid">
        <n-input-number v-model:value="point.lon" size="small" :precision="6" :step="0.0001" />
        <n-input-number v-model:value="point.lat" size="small" :precision="6" :step="0.0001" />
      </div>
    </n-form-item>
    <n-form-item label="全景图地址">
      <div class="pano-image-box">
        <n-input v-model:value="point.imageUrl" placeholder="/static/samples/panorama.jpg" data-testid="panorama-image-url" />
        <n-button size="small" :loading="uploading" @click="triggerUpload">上传图片</n-button>
        <input ref="fileInputRef" type="file" accept="image/*" class="hidden-file" @change="handleFileChange" />
      </div>
    </n-form-item>
    <n-form-item label="素材库">
      <data-source-picker
        from="material"
        material-category="image2d"
        material-filter="image"
        @select="handleMaterialSelect"
      />
    </n-form-item>
    <n-form-item v-if="point.imageUrl" label="预览">
      <img class="pano-preview" :src="point.imageUrl" alt="全景图预览" />
    </n-form-item>
    <n-alert type="info" :bordered="false" :show-icon="false" class="form-tip">
      先创建一个街景点；添加图层后可在“图层属性”里继续添加点位，并支持在地图上点选位置。
    </n-alert>
  </n-form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getUUID } from '@/utils'
import { uploadImage } from '../../api'
import { LayerDraft } from '../../types'
import DataSourcePicker from '../DataSourcePicker.vue'

const props = defineProps<{
  draft: LayerDraft
}>()

if (!props.draft.source.points) props.draft.source.points = []
if (!props.draft.source.points.length) {
  props.draft.source.points.push({
    id: getUUID(),
    name: '街景点 1',
    lon: 116.3913,
    lat: 39.9075,
    imageUrl: ''
  })
}
const point = props.draft.source.points[0]

const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

const triggerUpload = () => fileInputRef.value?.click()

const handleMaterialSelect = (payload: { url: string }) => {
  point.imageUrl = payload.url
}

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  const url = await uploadImage(file)
  uploading.value = false
  input.value = ''
  if (url) {
    point.imageUrl = url
  } else {
    window['$message'].error('全景图上传失败')
  }
}
</script>

<style lang="scss" scoped>
.pano-image-box {
  display: flex;
  gap: 8px;
  width: 100%;
}
.hidden-file {
  display: none;
}
.pano-preview {
  width: 180px;
  height: 60px;
  object-fit: cover;
  border: 1px solid rgba(81, 214, 169, 0.4);
  border-radius: 4px;
}
</style>
