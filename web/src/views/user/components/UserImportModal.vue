<template>
  <n-modal
    :show="show"
    preset="card"
    title="CSV 批量导入用户"
    style="width: 820px"
    :bordered="false"
    @update:show="close"
  >
    <n-space vertical :size="18">
      <n-alert type="info" :show-icon="false">
        请使用 UTF-8 编码的 CSV 文件，表头为
        <n-text code>username,nickname,role,password</n-text>
        ，其中 password 可留空；role 可填 teacher / student 或“教师” / “学生”。文件不超过 1MB。
      </n-alert>

      <n-space>
        <n-button @click="downloadTemplate">下载模板</n-button>
        <n-upload
          accept=".csv,text/csv"
          :show-file-list="false"
          :custom-request="handleUpload"
          :disabled="importing"
        >
          <n-button type="primary" :loading="importing">选择 CSV 文件并导入</n-button>
        </n-upload>
        <n-button
          v-if="results.length"
          type="success"
          secondary
          @click="downloadResult"
        >
          下载导入结果
        </n-button>
      </n-space>

      <template v-if="results.length">
        <n-space align="center" justify="space-between">
          <n-text strong>导入结果</n-text>
          <n-text depth="3">
            共 {{ results.length }} 行，成功 {{ successCount }} 行，失败 {{ results.length - successCount }} 行
          </n-text>
        </n-space>
        <n-data-table
          size="small"
          :columns="columns"
          :data="results"
          :max-height="320"
          :bordered="false"
        />
      </template>

      <n-space justify="end">
        <n-button @click="close">关闭</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { h } from 'vue'
import { NTag, type DataTableColumns, type UploadCustomRequestOptions } from 'naive-ui'
import { importUsersApi } from '@/api/path'
import type { ImportUserResult } from '@/api/path/user'
import { ResultEnum } from '@/enums/httpEnum'
import { downloadByA } from '@/utils'

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['update:show', 'success'])

const importing = ref(false)
const results = ref<ImportUserResult[]>([])

const successCount = computed(() => results.value.filter(item => item.ok).length)

const columns: DataTableColumns<ImportUserResult> = [
  { title: '行号', key: 'line', width: 70 },
  { title: '用户名', key: 'username', width: 140 },
  {
    title: '结果',
    key: 'ok',
    width: 80,
    render: row =>
      h(NTag, { type: row.ok ? 'success' : 'error', size: 'small', bordered: false }, {
        default: () => (row.ok ? '成功' : '失败')
      })
  },
  { title: '失败原因', key: 'reason', ellipsis: { tooltip: true } },
  { title: '初始密码', key: 'initialPassword', width: 140 }
]

watch(
  () => props.show,
  show => {
    if (show) results.value = []
  }
)

const close = () => {
  emit('update:show', false)
}

const escapeCsvCell = (value: string | number | boolean) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const downloadCsv = (filename: string, rows: (string | number | boolean)[][]) => {
  const content = rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n')
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' })
  downloadByA(URL.createObjectURL(blob), filename, 'csv')
}

const downloadTemplate = () => {
  downloadCsv('用户导入模板', [
    ['username', 'nickname', 'role', 'password'],
    ['T2026001', '张三', 'teacher', 'Teacher123'],
    ['S2026001', '李四', 'student', 'Student123']
  ])
}

const downloadResult = () => {
  downloadCsv('用户导入结果', [
    ['line', 'username', 'ok', 'reason', 'initialPassword'],
    ...results.value.map(item => [
      item.line,
      item.username,
      item.ok ? '成功' : '失败',
      item.reason || '',
      item.initialPassword || ''
    ])
  ])
}

const handleUpload = async ({ file, onFinish, onError }: UploadCustomRequestOptions) => {
  const rawFile = file.file
  if (!rawFile) return

  if (rawFile.size > 1024 * 1024) {
    window['$message'].error('CSV 文件不能超过 1MB')
    onError()
    return
  }

  importing.value = true
  try {
    const formData = new FormData()
    formData.append('file', rawFile)
    const res = await importUsersApi(formData)
    if (res && res.code === ResultEnum.SUCCESS) {
      results.value = res.data || []
      const okCount = results.value.filter(item => item.ok).length
      window['$message'].success(`导入完成：成功 ${okCount} 行，失败 ${results.value.length - okCount} 行`)
      emit('success')
      onFinish()
      return
    }
    onError()
  } catch {
    onError()
  } finally {
    importing.value = false
  }
}
</script>
