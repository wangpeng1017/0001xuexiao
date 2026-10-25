<template>
  <div class="upload-panel">
    <div
      class="drop-zone"
      :class="{ 'is-over': dragOver }"
      @click="pickFile"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <input ref="inputRef" type="file" class="file-input" @change="onInputChange" />
      <n-icon size="34" class="drop-icon"><CloudUploadOutline /></n-icon>
      <div class="drop-title">拖拽数据文件到这里，或点击选择</div>
      <div class="drop-tip">
        支持 LAS/LAZ 点云、Shapefile/GDB/GeoJSON/KML/CSV 等矢量、GeoTIFF 等栅格、3D Tiles zip；
        支持大文件分片上传与断点续传。
      </div>
    </div>

    <n-card v-if="currentFile" size="small" :bordered="false" class="progress-card">
      <div class="progress-head">
        <div class="progress-name">
          <n-ellipsis style="max-width: 360px">{{ currentFile.name }}</n-ellipsis>
          <span class="progress-size">{{ formatSize(currentFile.size) }}</span>
        </div>
        <n-tag size="small" :type="statusTagType" :bordered="false">{{ statusText }}</n-tag>
      </div>
      <n-progress
        type="line"
        :percentage="percent"
        :status="status === 'failed' ? 'error' : status === 'success' ? 'success' : 'default'"
        :height="10"
      />
      <div class="progress-foot">
        <span>{{ statusMessage }}</span>
        <n-space size="small" align="center">
          <span v-if="status === 'uploading'" class="speed">{{ formatSpeed(speed) }}</span>
          <n-button v-if="status === 'failed'" size="tiny" type="primary" secondary @click="retry">
            重试 / 续传
          </n-button>
        </n-space>
      </div>
    </n-card>

    <SrsModal
      v-model:show="srsShow"
      :file-name="pendingFile?.name || ''"
      @confirm="handleSrsConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { CloudUploadOutline } from '@vicons/ionicons5'
import { uploadFileInChunks, formatSpeed } from '../../upload'
import SrsModal from './SrsModal.vue'

const emit = defineEmits<{ (event: 'uploaded', id: string): void }>()

const inputRef = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const currentFile = ref<File | null>(null)
const pendingFile = ref<File | null>(null)
const srsShow = ref(false)
const selectedSrs = ref<string | undefined>(undefined)
const status = ref<'idle' | 'uploading' | 'success' | 'failed'>('idle')
const percent = ref(0)
const speed = ref(0)
const statusMessage = ref('')

const statusText = computed(() => {
  if (status.value === 'uploading') return '上传中'
  if (status.value === 'success') return '上传完成'
  if (status.value === 'failed') return '上传失败'
  return '待上传'
})
const statusTagType = computed(() => {
  if (status.value === 'uploading') return 'info'
  if (status.value === 'success') return 'success'
  if (status.value === 'failed') return 'error'
  return 'default'
})

function formatSize(size: number): string {
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  return `${(size / 1024).toFixed(1)} KB`
}

function pickFile() {
  inputRef.value?.click()
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) handleFile(file)
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function handleFile(file: File) {
  if (!file.size) {
    window['$message'].error('文件内容为空')
    return
  }
  if (/\.(las|laz)$/i.test(file.name)) {
    pendingFile.value = file
    srsShow.value = true
    return
  }
  void startUpload(file, undefined)
}

function handleSrsConfirm(srs?: string) {
  const file = pendingFile.value
  srsShow.value = false
  pendingFile.value = null
  if (file) void startUpload(file, srs)
}

async function startUpload(file: File, srs: string | undefined) {
  currentFile.value = file
  selectedSrs.value = srs
  status.value = 'uploading'
  percent.value = 0
  speed.value = 0
  statusMessage.value = '正在初始化上传...'
  try {
    const id = await uploadFileInChunks(file, {
      srs,
      onResumed: (uploadedChunks, totalChunks) => {
        statusMessage.value = `检测到未完成上传，从第 ${uploadedChunks + 1}/${totalChunks} 片继续`
      },
      onProgress: (progress) => {
        percent.value = progress.percent
        speed.value = progress.speed
        statusMessage.value = `已上传 ${formatSize(progress.loaded)} / ${formatSize(file.size)}`
      }
    })
    percent.value = 100
    status.value = 'success'
    statusMessage.value = '上传完成，已进入转换队列'
    window['$message'].success('上传完成，正在后台转换')
    emit('uploaded', id)
  } catch (error) {
    status.value = 'failed'
    statusMessage.value = (error as Error).message || '上传失败'
    window['$message'].error(statusMessage.value)
  }
}

function retry() {
  if (currentFile.value) void startUpload(currentFile.value, selectedSrs.value)
}
</script>

<style lang="scss" scoped>
.upload-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.drop-zone {
  border: 1px dashed rgba(128, 128, 128, 0.45);
  border-radius: 8px;
  padding: 22px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  &.is-over {
    border-color: var(--primary-color);
    background-color: rgba(64, 158, 255, 0.08);
  }
  .file-input {
    display: none;
  }
  .drop-icon {
    color: var(--primary-color);
  }
  .drop-title {
    margin-top: 6px;
    font-weight: 600;
  }
  .drop-tip {
    margin-top: 6px;
    color: #8a8f99;
    font-size: 12px;
    line-height: 1.6;
  }
}
.progress-card {
  border-radius: 8px;
  .progress-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    .progress-name {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }
    .progress-size {
      color: #8a8f99;
      font-size: 12px;
      white-space: nowrap;
    }
  }
  .progress-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    color: #8a8f99;
    font-size: 12px;
    gap: 8px;
  }
}
</style>
