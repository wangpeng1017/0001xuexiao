<template>
  <div class="go-user-manage">
    <n-card :bordered="false" class="manage-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <n-input
            v-model:value.trim="keyword"
            clearable
            placeholder="搜索用户名或姓名"
            style="width: 260px"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
          <n-button type="primary" secondary @click="handleSearch">搜索</n-button>
        </div>
        <n-space>
          <n-button type="primary" @click="openCreate">新建用户</n-button>
          <n-button secondary @click="importShow = true">CSV 批量导入</n-button>
        </n-space>
      </div>

      <n-data-table
        :columns="columns"
        :data="list"
        :loading="loading"
        :row-key="row => row.id"
        :bordered="false"
        :scroll-x="900"
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

    <user-form-modal
      v-model:show="formShow"
      :user="editingUser"
      :current-user-id="currentUserId"
      @success="handleFormSuccess"
    />

    <password-result-modal
      v-model:show="passwordShow"
      :title="passwordTitle"
      :password="initialPassword"
    />

    <user-import-modal v-model:show="importShow" @success="fetchList" />
  </div>
</template>

<script lang="ts" setup>
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NButton, NSpace, NTag, type DataTableColumns } from 'naive-ui'
import dayjs from 'dayjs'
import { userListApi } from '@/api/path'
import { resetUserPasswordApi } from '@/api/path'
import type { UserItem } from '@/api/path/user'
import { roleLabelMap } from '@/enums/roleEnum'
import { ResultEnum } from '@/enums/httpEnum'
import { goDialog } from '@/utils'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import UserFormModal from './components/UserFormModal.vue'
import PasswordResultModal from './components/PasswordResultModal.vue'
import UserImportModal from './components/UserImportModal.vue'

const systemStore = useSystemStore()
const currentUserId = computed(() => systemStore.getUserInfo.userId || '')

const loading = ref(false)
const keyword = ref('')
const list = ref<UserItem[]>([])
const paginat = reactive({
  page: 1,
  limit: 10,
  count: 0
})

const formShow = ref(false)
const editingUser = ref<UserItem | null>(null)
const passwordShow = ref(false)
const passwordTitle = ref('初始密码')
const initialPassword = ref('')
const importShow = ref(false)

const formatTime = (value: string) => {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'
}

const columns: DataTableColumns<UserItem> = [
  { title: '用户名', key: 'username', width: 150 },
  { title: '姓名', key: 'nickname', width: 130 },
  {
    title: '角色',
    key: 'role',
    width: 100,
    render: row => roleLabelMap[row.role] || row.role
  },
  {
    title: '状态',
    key: 'disabled',
    width: 90,
    render: row =>
      h(
        NTag,
        { type: row.disabled ? 'error' : 'success', size: 'small', bordered: false },
        { default: () => (row.disabled ? '禁用' : '启用') }
      )
  },
  {
    title: '创建时间',
    key: 'createTime',
    width: 170,
    render: row => formatTime(row.createTime)
  },
  {
    title: '操作',
    key: 'actions',
    width: 170,
    render: row =>
      h(
        NSpace,
        { size: 4 },
        {
          default: () => [
            h(
              NButton,
              {
                text: true,
                type: 'primary',
                size: 'small',
                onClick: () => openEdit(row)
              },
              { default: () => '编辑' }
            ),
            h(
              NButton,
              {
                text: true,
                type: 'warning',
                size: 'small',
                onClick: () => resetPassword(row)
              },
              { default: () => '重置密码' }
            )
          ]
        }
      )
  }
]

const fetchList = async () => {
  loading.value = true
  try {
    const res = await userListApi({
      page: paginat.page,
      limit: paginat.limit,
      keyword: keyword.value
    })
    if (res && res.data) {
      list.value = res.data
      paginat.count = res.count || 0
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
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

const openCreate = () => {
  editingUser.value = null
  formShow.value = true
}

const openEdit = (row: UserItem) => {
  editingUser.value = row
  formShow.value = true
}

const handleFormSuccess = (payload?: { username: string; initialPassword: string }) => {
  fetchList()
  if (payload?.initialPassword) {
    initialPassword.value = payload.initialPassword
    passwordTitle.value = `用户「${payload.username}」创建成功`
    passwordShow.value = true
  }
}

const resetPassword = (row: UserItem) => {
  goDialog({
    message: `确定重置用户「${row.nickname || row.username}」的密码吗？重置后需要重新登录并修改密码。`,
    promise: true,
    onPositiveCallback: () => resetUserPasswordApi({ id: row.id }),
    promiseResCallback: (res: any) => {
      if (res && res.code === ResultEnum.SUCCESS && res.data) {
        initialPassword.value = res.data.initialPassword
        passwordTitle.value = `用户「${row.username}」密码已重置`
        passwordShow.value = true
        fetchList()
      }
    }
  })
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.go-user-manage {
  padding: 20px;
}

.manage-card {
  border-radius: 8px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}
</style>
