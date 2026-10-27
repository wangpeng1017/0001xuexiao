<template>
  <div class="go-dataset">
    <n-card :bordered="false" class="manage-card">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">第三方数据</div>
            <div class="page-desc">
              接入学校物联网 RESTful 接口或 MySQL 业务库，供大屏组件通过“动态请求”轮询使用。
            </div>
          </div>
          <n-button type="primary" @click="openCreate">新建第三方数据</n-button>
        </div>
      </template>

      <div class="toolbar">
        <div class="toolbar-left">
          <n-input
            v-model:value.trim="keyword"
            clearable
            placeholder="搜索第三方数据名称"
            style="width: 260px"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
          <n-button secondary @click="handleSearch">搜索</n-button>
        </div>
        <n-tag :bordered="false" size="small">共 {{ paginat.count }} 个</n-tag>
      </div>

      <n-data-table
        :columns="columns"
        :data="list"
        :loading="loading"
        :row-key="(row: DatasetItem) => row.id"
        :bordered="false"
        :scroll-x="1100"
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

    <DatasetFormModal
      v-model:show="formShow"
      :dataset="editing"
      @success="fetchList"
    />

    <DatasetPreviewModal
      v-model:show="previewShow"
      :title="previewTitle"
      :data="previewData"
      :truncated="previewTruncated"
    />
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, reactive, ref } from 'vue'
import { NButton, NSpace, NTag, type DataTableColumns } from 'naive-ui'
import dayjs from 'dayjs'
import { DialogEnum } from '@/enums/pluginEnum'
import { ResultEnum } from '@/enums/httpEnum'
import { goDialog } from '@/utils'
import { datasetDeleteApi, datasetListApi, datasetTestApi } from '../api'
import type { DatasetItem } from '../types'
import DatasetFormModal from './components/DatasetFormModal.vue'
import DatasetPreviewModal from './components/DatasetPreviewModal.vue'

const loading = ref(false)
const keyword = ref('')
const list = ref<DatasetItem[]>([])
const paginat = reactive({ page: 1, limit: 10, count: 0 })
const formShow = ref(false)
const editing = ref<DatasetItem | null>(null)
const previewShow = ref(false)
const previewTitle = ref('数据预览')
const previewData = ref<unknown>(null)
const previewTruncated = ref(false)

function configSummary(row: DatasetItem): string {
  if (row.type === 'http') {
    const config = row.config as { url: string; method: string; dataPath: string }
    return `${config.method} ${config.url}${config.dataPath ? ` → ${config.dataPath}` : ''}`
  }
  const config = row.config as { host: string; port: number; database: string }
  return `mysql://${config.host}:${config.port}/${config.database}`
}

const columns: DataTableColumns<DatasetItem> = [
  { title: '名称', key: 'name', width: 160, ellipsis: { tooltip: true } },
  {
    title: '类型',
    key: 'type',
    width: 100,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.type === 'http' ? 'info' : 'warning', bordered: false },
        { default: () => (row.type === 'http' ? 'HTTP' : 'MySQL') }
      )
  },
  {
    title: '配置',
    key: 'config',
    width: 340,
    ellipsis: { tooltip: true },
    render: (row) => configSummary(row)
  },
  {
    title: '创建时间',
    key: 'createTime',
    width: 160,
    render: (row) => dayjs(row.createTime).format('YYYY-MM-DD HH:mm')
  },
  { title: '创建人', key: 'createUserName', width: 100 },
  {
    title: '操作',
    key: 'actions',
    width: 300,
    fixed: 'right',
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () => [
            h(
              NButton,
              { text: true, type: 'info', size: 'small', onClick: () => testDataset(row) },
              { default: () => '测试' }
            ),
            h(
              NButton,
              { text: true, type: 'primary', size: 'small', onClick: () => copyUrl(row) },
              { default: () => '复制接口地址' }
            ),
            h(
              NButton,
              { text: true, type: 'primary', size: 'small', onClick: () => openEdit(row) },
              { default: () => '编辑' }
            ),
            h(
              NButton,
              { text: true, type: 'error', size: 'small', onClick: () => confirmDelete(row) },
              { default: () => '删除' }
            )
          ]
        }
      )
  }
]

async function fetchList() {
  loading.value = true
  try {
    const res = await datasetListApi({
      page: paginat.page,
      limit: paginat.limit,
      keyword: keyword.value || undefined
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      list.value = res.data || []
      paginat.count = res.count || 0
    } else if (res?.msg) {
      window['$message'].error(res.msg)
    }
  } finally {
    loading.value = false
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

function openCreate() {
  editing.value = null
  formShow.value = true
}

function openEdit(row: DatasetItem) {
  editing.value = row
  formShow.value = true
}

async function testDataset(row: DatasetItem) {
  const res = await datasetTestApi({ id: row.id })
  if (!res || res.code !== ResultEnum.SUCCESS) {
    if (res?.msg) window['$message'].error(res.msg)
    return
  }
  previewTitle.value = `测试结果 · ${row.name}`
  previewData.value = res.data
  previewTruncated.value = Boolean((res as unknown as { truncated?: boolean }).truncated)
  previewShow.value = true
}

async function copyUrl(row: DatasetItem) {
  const url = `${window.location.origin}/api/goview/open/dataset/${row.id}/data`
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  window['$message'].success('接口地址已复制，在组件的“数据 → 动态请求”中粘贴此地址', {
    duration: 6000
  })
}

function confirmDelete(row: DatasetItem) {
  goDialog({
    type: DialogEnum.DELETE,
    message: `确定删除第三方数据「${row.name}」吗？`,
    promise: true,
    onPositiveCallback: () => datasetDeleteApi([row.id]),
    promiseResCallback: (res: any) => {
      if (res?.code === ResultEnum.SUCCESS) {
        window['$message'].success('已删除')
        fetchList()
      }
    }
  })
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.go-dataset {
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
    margin-bottom: 12px;
    .toolbar-left {
      display: flex;
      gap: 8px;
    }
  }
  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
}
</style>
