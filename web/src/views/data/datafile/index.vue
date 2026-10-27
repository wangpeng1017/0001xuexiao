<template>
  <div class="go-datafile">
    <n-card :bordered="false" class="manage-card">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">数据文件</div>
            <div class="page-desc">
              上传 LAS/LAZ、Shapefile、GeoTIFF、3D Tiles 等文件，后台自动识别并转换，失败可重试。
            </div>
          </div>
          <n-tag :bordered="false" size="small">共 {{ paginat.count }} 个</n-tag>
        </div>
      </template>

      <UploadPanel @uploaded="handleUploaded" />

      <div class="toolbar">
        <div class="toolbar-left">
          <n-input
            v-model:value.trim="keyword"
            clearable
            placeholder="搜索文件名"
            style="width: 240px"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
          <n-select
            v-model:value="statusFilter"
            :options="statusOptions"
            clearable
            placeholder="全部状态"
            style="width: 150px"
            @update:value="handleSearch"
          />
          <n-button secondary @click="handleSearch">搜索</n-button>
        </div>
        <n-button secondary :loading="loading" @click="fetchList()">刷新</n-button>
      </div>

      <DataFileTable
        :items="list"
        :loading="loading"
        @retry="handleRetry"
        @refresh="fetchList()"
      />

      <div class="pagination">
        <n-pagination
          :page="paginat.page"
          :page-size="paginat.limit"
          :item-count="paginat.count"
          :page-sizes="[10, 20, 50]"
          show-size-picker
          @update:page="changePage"
          @update:page-size="changeSize"
        />
      </div>
    </n-card>

    <SrsModal
      v-model:show="retrySrsShow"
      :file-name="retryTarget?.name || ''"
      :default-srs="retryTarget?.srs || ''"
      @confirm="handleRetrySrs"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ResultEnum } from '@/enums/httpEnum'
import { dataFileListApi, dataFileRetryApi } from '../api'
import { statusLabelMap, type DataFileItem, type LocalAnchor } from '../types'
import UploadPanel from './components/UploadPanel.vue'
import DataFileTable from './components/DataFileTable.vue'
import SrsModal from './components/SrsModal.vue'

const loading = ref(false)
const keyword = ref('')
const statusFilter = ref<string | null>(null)
const list = ref<DataFileItem[]>([])
const paginat = reactive({ page: 1, limit: 10, count: 0 })
const retrySrsShow = ref(false)
const retryTarget = ref<DataFileItem | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusOptions = Object.entries(statusLabelMap).map(([value, label]) => ({ value, label }))

const hasActive = computed(() =>
  list.value.some((item) => item.status === 'pending' || item.status === 'converting')
)

async function fetchList(silent = false) {
  if (!silent) loading.value = true
  try {
    const res = await dataFileListApi({
      page: paginat.page,
      limit: paginat.limit,
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      list.value = res.data || []
      paginat.count = res.count || 0
    } else if (!silent && res?.msg) {
      window['$message'].error(res.msg)
    }
  } finally {
    if (!silent) loading.value = false
  }
}

function handleSearch() {
  paginat.page = 1
  fetchList()
}

function changePage(page: number) {
  paginat.page = page
  fetchList()
}

function changeSize(size: number) {
  paginat.limit = size
  paginat.page = 1
  fetchList()
}

function handleUploaded() {
  paginat.page = 1
  fetchList()
}

function handleRetry(row: DataFileItem) {
  if (row.originFormat === 'LAS' || row.originFormat === 'LAZ') {
    retryTarget.value = row
    retrySrsShow.value = true
    return
  }
  void doRetry(row.id)
}

function handleRetrySrs(srs?: string, anchor?: LocalAnchor) {
  const target = retryTarget.value
  if (target) void doRetry(target.id, srs, anchor)
}

async function doRetry(id: string, srs?: string, anchor?: LocalAnchor) {
  const res = await dataFileRetryApi({ id, srs, anchor })
  if (res && res.code === ResultEnum.SUCCESS) {
    window['$message'].success('已重新加入转换队列')
    fetchList()
  } else if (res?.msg) {
    window['$message'].error(res.msg)
  }
}

onMounted(() => {
  fetchList()
  pollTimer = setInterval(() => {
    if (hasActive.value && !loading.value) void fetchList(true)
  }, 3000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style lang="scss" scoped>
.go-datafile {
  padding: 16px;
  .manage-card {
    border-radius: 10px;
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    .page-title {
      font-size: 18px;
      font-weight: 600;
    }
    .page-desc {
      margin-top: 4px;
      color: #8a8f99;
      font-size: 12px;
    }
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 16px 0 12px;
    gap: 12px;
    .toolbar-left {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
  }
  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
}
</style>
