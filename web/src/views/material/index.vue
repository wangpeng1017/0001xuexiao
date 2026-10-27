<template>
  <div class="go-material-library">
    <n-card :bordered="false" class="library-card">
      <div class="toolbar">
        <div class="toolbar-title">
          <span class="title">素材库</span>
          <span class="desc">模型、地图与二维素材，可在编辑器中直接选用</span>
        </div>
        <n-button type="primary" @click="openUpload">上传素材</n-button>
      </div>

      <n-tabs v-model:value="category" type="line" @update:value="handleCategoryChange">
        <n-tab-pane v-for="tab in tabs" :key="tab.value" :name="tab.value" :tab="tab.label">
          <n-spin :show="loading">
            <div class="material-grid">
              <n-card
                v-for="item in list"
                :key="item.id"
                size="small"
                hoverable
                class="material-card"
                @click="openDetail(item)"
              >
                <div class="material-thumb">
                  <n-image
                    v-if="item.thumb"
                    object-fit="contain"
                    height="120"
                    preview-disabled
                    :src="item.thumb"
                    :fallback-src="requireErrorImg()"
                  />
                  <n-icon v-else size="36" depth="3">
                    <ImagesIcon />
                  </n-icon>
                </div>
                <div class="material-info">
                  <n-text class="material-name go-ellipsis-1">{{ item.name }}</n-text>
                  <n-space :size="6">
                    <n-tag size="tiny" :bordered="false" :type="item.scope === 'public' ? 'success' : 'default'">
                      {{ item.scope === 'public' ? '公共' : '私有' }}
                    </n-tag>
                    <n-text depth="3" class="material-meta">{{ item.createUserName }}</n-text>
                  </n-space>
                  <n-text depth="3" class="material-meta">
                    {{ formatTime(item.createTime) }}
                  </n-text>
                </div>
                <template #footer>
                  <n-space justify="space-between" align="center">
                    <n-button
                      v-if="item.category === 'image2d'"
                      text
                      type="primary"
                      size="small"
                      @click.stop="copyUrl(item)"
                    >
                      复制地址
                    </n-button>
                    <span v-else />
                    <n-button
                      v-if="canDelete(item)"
                      text
                      type="error"
                      size="small"
                      @click.stop="confirmDelete(item)"
                    >
                      删除
                    </n-button>
                  </n-space>
                </template>
              </n-card>
              <n-empty
                v-if="!loading && list.length === 0"
                :description="`暂无${currentTabLabel}素材`"
                class="material-empty"
              />
            </div>
          </n-spin>

          <div class="pagination">
            <n-pagination
              :page="paginat.page"
              :page-size="paginat.limit"
              :item-count="paginat.count"
              :page-sizes="[12, 24, 48]"
              show-size-picker
              @update:page="changePage"
              @update:page-size="changeSize"
            />
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <n-modal v-model:show="detailShow" preset="card" title="素材详情" style="width: 560px">
      <template v-if="detailItem">
        <div class="detail-preview">
          <n-image
            v-if="detailItem.category === 'image2d' || detailItem.thumb"
            object-fit="contain"
            height="240"
            :src="detailItem.category === 'image2d' ? detailItem.url : detailItem.thumb"
            :fallback-src="requireErrorImg()"
          />
          <n-icon v-else size="48" depth="3">
            <ImagesIcon />
          </n-icon>
        </div>
        <n-descriptions :column="1" label-placement="left" size="small" class="detail-desc">
          <n-descriptions-item label="名称">{{ detailItem.name }}</n-descriptions-item>
          <n-descriptions-item label="类型">
            {{ tabs.find(tab => tab.value === detailItem?.category)?.label }}
          </n-descriptions-item>
          <n-descriptions-item label="可见范围">
            {{ detailItem.scope === 'public' ? '公共' : '私有' }}
          </n-descriptions-item>
          <n-descriptions-item label="上传人">{{ detailItem.createUserName }}</n-descriptions-item>
          <n-descriptions-item label="上传时间">
            {{ formatTime(detailItem.createTime) }}
          </n-descriptions-item>
          <n-descriptions-item label="素材地址">{{ detailItem.url }}</n-descriptions-item>
        </n-descriptions>
      </template>
      <template #footer>
        <n-space justify="end">
          <n-button @click="detailShow = false">关闭</n-button>
          <n-button type="primary" @click="detailItem && copyUrl(detailItem)">复制地址</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="uploadShow" preset="card" title="上传素材" style="width: 480px">
      <n-space vertical size="large">
        <n-form-item label="素材类型" :show-feedback="false">
          <n-select v-model:value="uploadCategory" :options="categoryOptions" />
        </n-form-item>
        <n-form-item label="素材名称" :show-feedback="false">
          <n-input
            v-model:value.trim="uploadName"
            maxlength="100"
            show-count
            placeholder="请输入素材名称"
          />
        </n-form-item>
        <n-form-item label="可见范围" :show-feedback="false">
          <n-select v-model:value="uploadScope" :options="scopeOptions" />
        </n-form-item>
        <n-form-item label="选择文件" :show-feedback="false">
          <div class="file-box">
            <input ref="fileInputRef" type="file" :accept="accept" @change="handleFileChange" />
            <n-text depth="3" class="file-hint">{{ uploadHint }}</n-text>
          </div>
        </n-form-item>
      </n-space>
      <template #footer>
        <n-space justify="end">
          <n-button @click="uploadShow = false">取消</n-button>
          <n-button type="primary" :loading="uploading" @click="confirmUpload">
            上传
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { useClipboard } from '@vueuse/core'
import { materialDeleteApi, materialListApi, materialThumbApi, materialUploadApi } from '@/api/path'
import type { MaterialCategory, MaterialItem, MaterialScope } from '@/api/path/material'
import { icon } from '@/plugins'
import { ResultEnum } from '@/enums/httpEnum'
import { DialogEnum } from '@/enums/pluginEnum'
import { getStoredRole, goDialog, requireErrorImg } from '@/utils'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { renderModelThumbnail } from './utils/modelThumb'

const { ImagesIcon } = icon.ionicons5
const { copy } = useClipboard({ legacy: true })
const systemStore = useSystemStore()
const isAdmin = getStoredRole() === 'admin'
const ownName =
  systemStore.getUserInfo.nickName || systemStore.getUserInfo.userName || ''

const tabs = [
  { label: '模型', value: 'model' as MaterialCategory },
  { label: '地图', value: 'map' as MaterialCategory },
  { label: '二维', value: 'image2d' as MaterialCategory }
]
const categoryOptions = tabs.map(tab => ({ label: tab.label, value: tab.value }))

const category = ref<MaterialCategory>('model')
const currentTabLabel = computed(
  () => tabs.find(tab => tab.value === category.value)?.label || ''
)
const loading = ref(false)
const list = ref<MaterialItem[]>([])
const paginat = reactive({ page: 1, limit: 12, count: 0 })

const detailShow = ref(false)
const detailItem = ref<MaterialItem | null>(null)

const uploadShow = ref(false)
const uploading = ref(false)
const uploadCategory = ref<MaterialCategory>('model')
const uploadName = ref('')
const uploadScope = ref<MaterialScope>('private')
const uploadFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const scopeOptions = computed(() => [
  { label: '私有（仅自己可见）', value: 'private' },
  ...(isAdmin ? [{ label: '公共（所有人可见）', value: 'public' }] : [])
])

const accept = computed(() => {
  if (uploadCategory.value === 'model') return '.glb,.zip'
  if (uploadCategory.value === 'map') return '.geojson,.zip'
  return '.png,.jpg,.jpeg,.svg,.gif,.webp'
})

const uploadHint = computed(() => {
  if (uploadCategory.value === 'model') {
    return '支持 .glb，或包含 .gltf 的 zip 压缩包，最大 200MB'
  }
  if (uploadCategory.value === 'map') {
    return '支持 .geojson，或包含 {z}/{x}/{y}.png 瓦片的 zip，最大 200MB'
  }
  return '支持 png/jpg/jpeg/svg/gif/webp，最大 200MB'
})

const formatTime = (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-')

const fetchList = async () => {
  loading.value = true
  try {
    const res = await materialListApi({
      category: category.value,
      page: paginat.page,
      limit: paginat.limit
    })
    if (res && res.data) {
      list.value = res.data
      paginat.count = res.count || 0
    }
  } finally {
    loading.value = false
  }
}

const handleCategoryChange = (value: MaterialCategory) => {
  category.value = value
  paginat.page = 1
  fetchList()
}

const changePage = (page: number) => {
  paginat.page = page
  fetchList()
}

const changeSize = (size: number) => {
  paginat.limit = size
  paginat.page = 1
  fetchList()
}

const canDelete = (item: MaterialItem) => isAdmin || item.createUserName === ownName

const copyUrl = async (item: MaterialItem) => {
  await copy(`${window.location.origin}${item.url}`)
  window['$message'].success('素材地址已复制')
}

const openDetail = (item: MaterialItem) => {
  detailItem.value = item
  detailShow.value = true
}

const openUpload = () => {
  uploadCategory.value = category.value
  uploadName.value = ''
  uploadScope.value = 'private'
  uploadFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
  uploadShow.value = true
}

const handleFileChange = (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  uploadFile.value = files && files.length > 0 ? files[0] : null
}

const confirmUpload = async () => {
  if (!uploadName.value) {
    window['$message'].warning('请输入素材名称')
    return
  }
  if (!uploadFile.value) {
    window['$message'].warning('请选择要上传的文件')
    return
  }
  uploading.value = true
  try {
    const data = new FormData()
    data.append('file', uploadFile.value)
    data.append('category', uploadCategory.value)
    data.append('name', uploadName.value)
    data.append('scope', uploadScope.value)
    const res = await materialUploadApi(data)
    if (res && res.code === ResultEnum.SUCCESS) {
      if (res.data.category === 'model') {
        const thumbFile = await renderModelThumbnail(res.data.url)
        if (thumbFile) {
          await materialThumbApi(res.data.id, thumbFile)
        } else {
          window['$message'].warning('素材已上传，但缩略图生成失败')
        }
      }
      window['$message'].success('上传成功')
      uploadShow.value = false
      if (category.value !== uploadCategory.value) {
        category.value = uploadCategory.value
      }
      paginat.page = 1
      await fetchList()
    }
  } finally {
    uploading.value = false
  }
}

const confirmDelete = (item: MaterialItem) => {
  goDialog({
    type: DialogEnum.DELETE,
    message: `确定删除素材「${item.name}」吗？关联的大屏内容可能无法显示。`,
    promise: true,
    onPositiveCallback: () => materialDeleteApi(item.id),
    promiseResCallback: async (res: any) => {
      if (res && res.code === ResultEnum.SUCCESS) {
        window['$message'].success('素材已删除')
        await fetchList()
      }
    }
  })
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.go-material-library {
  padding: 20px;
}

.library-card {
  border-radius: 8px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.toolbar-title {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .title {
    font-size: 18px;
    font-weight: 600;
  }

  .desc {
    font-size: 12px;
    opacity: 0.65;
  }
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  min-height: 160px;
}

.material-card {
  cursor: pointer;
}

.detail-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
}

.detail-desc {
  margin-top: 12px;
  word-break: break-all;
}

.material-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
}

.material-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.material-name {
  font-weight: 500;
}

.material-meta {
  font-size: 12px;
}

.material-empty {
  grid-column: 1 / -1;
  padding: 50px 0;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.file-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-hint {
  font-size: 12px;
}
</style>
