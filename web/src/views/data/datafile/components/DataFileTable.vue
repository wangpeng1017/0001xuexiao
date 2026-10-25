<template>
  <n-data-table
    :columns="columns"
    :data="items"
    :loading="loading"
    :row-key="(row: DataFileItem) => row.id"
    :bordered="false"
    :scroll-x="1360"
    size="small"
  />
</template>

<script setup lang="ts">
import { h } from 'vue'
import { NButton, NProgress, NSpace, NTag, type DataTableColumns } from 'naive-ui'
import dayjs from 'dayjs'
import { DialogEnum } from '@/enums/pluginEnum'
import { ResultEnum } from '@/enums/httpEnum'
import { goDialog } from '@/utils'
import { dataFileDeleteApi } from '../../api'
import { kindLabelMap, statusLabelMap, type DataFileItem } from '../../types'

defineProps<{
  items: DataFileItem[]
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'retry', row: DataFileItem): void
  (event: 'refresh'): void
}>()

const statusType = (status: string) => {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'converting') return 'info'
  return 'default'
}

const columns: DataTableColumns<DataFileItem> = [
  {
    title: '名称',
    key: 'name',
    width: 220,
    ellipsis: { tooltip: true }
  },
  { title: '格式', key: 'originFormat', width: 100 },
  {
    title: '类型',
    key: 'kind',
    width: 100,
    render: (row) => kindLabelMap[row.kind] || '-'
  },
  {
    title: '状态',
    key: 'status',
    width: 150,
    render: (row) =>
      h('div', { class: 'status-cell' }, [
        h(
          NTag,
          { size: 'small', type: statusType(row.status), bordered: false },
          { default: () => statusLabelMap[row.status] || row.status }
        ),
        row.status === 'converting' || row.status === 'pending'
          ? h(NProgress, {
              type: 'line',
              percentage: row.progress,
              height: 6,
              showIndicator: false,
              style: 'margin-top: 4px'
            })
          : null
      ])
  },
  {
    title: '失败原因',
    key: 'errorMsg',
    width: 220,
    ellipsis: { tooltip: true },
    render: (row) => row.errorMsg || '-'
  },
  {
    title: '坐标系',
    key: 'srs',
    width: 110,
    render: (row) => row.srs || '-'
  },
  {
    title: '创建时间',
    key: 'createTime',
    width: 160,
    render: (row) => dayjs(row.createTime).format('YYYY-MM-DD HH:mm')
  },
  { title: '创建人', key: 'createUserName', width: 110 },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    fixed: 'right',
    render: (row) =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () => [
            row.status === 'failed'
              ? h(
                  NButton,
                  {
                    text: true,
                    type: 'primary',
                    size: 'small',
                    onClick: () => emit('retry', row)
                  },
                  { default: () => '重试' }
                )
              : null,
            h(
              NButton,
              {
                text: true,
                type: 'error',
                size: 'small',
                onClick: () => confirmDelete(row)
              },
              { default: () => '删除' }
            )
          ]
        }
      )
  }
]

function confirmDelete(row: DataFileItem) {
  goDialog({
    type: DialogEnum.DELETE,
    message: `确定删除数据文件「${row.name}」吗？磁盘上的转换结果也会一起删除。`,
    promise: true,
    onPositiveCallback: () => dataFileDeleteApi([row.id]),
    promiseResCallback: (res: any) => {
      if (res?.code === ResultEnum.SUCCESS) {
        window['$message'].success('已删除')
        emit('refresh')
      }
    }
  })
}
</script>

<style lang="scss" scoped>
:deep(.status-cell) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
</style>
