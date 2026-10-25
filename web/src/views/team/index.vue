<template>
  <div class="go-team-manage">
    <n-card :bordered="false" class="manage-card">
      <div class="toolbar">
        <div class="toolbar-title">
          <span class="title">团队管理</span>
          <span class="desc">创建团队并邀请成员，团队项目可协同编辑</span>
        </div>
        <n-button type="primary" @click="openCreate">新建团队</n-button>
      </div>

      <n-data-table
        :columns="columns"
        :data="teams"
        :loading="loading"
        :row-key="(row: TeamItem) => row.id"
        :bordered="false"
      />
    </n-card>

    <n-modal v-model:show="createShow" preset="card" title="新建团队" style="width: 440px">
      <n-input
        v-model:value.trim="createName"
        maxlength="50"
        show-count
        placeholder="请输入团队名称"
        @keyup.enter="confirmCreate"
      />
      <template #footer>
        <n-space justify="end">
          <n-button @click="createShow = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="confirmCreate">创建</n-button>
        </n-space>
      </template>
    </n-modal>

    <team-detail-drawer
      v-model:show="detailShow"
      :team-id="detailTeamId"
      @changed="fetchTeams"
    />
  </div>
</template>

<script lang="ts" setup>
import { h, onMounted, ref } from 'vue'
import { NButton, NSpace, type DataTableColumns } from 'naive-ui'
import dayjs from 'dayjs'
import { useRouter } from 'vue-router'
import { teamCreateApi, teamListApi } from '@/api/path'
import type { TeamItem } from '@/api/path/team'
import { PageEnum } from '@/enums/pageEnum'
import { RoleEnum } from '@/enums/roleEnum'
import { ResultEnum } from '@/enums/httpEnum'
import { getStoredRole } from '@/utils'
import TeamDetailDrawer from './components/TeamDetailDrawer.vue'

const router = useRouter()
const role = getStoredRole()

const loading = ref(false)
const teams = ref<TeamItem[]>([])
const createShow = ref(false)
const createName = ref('')
const creating = ref(false)
const detailShow = ref(false)
const detailTeamId = ref<string | null>(null)

if (role !== RoleEnum.ADMIN && role !== RoleEnum.TEACHER) {
  router.replace({ name: PageEnum.ERROR_PAGE_NAME_403 })
}

const formatTime = (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-')

const columns: DataTableColumns<TeamItem> = [
  { title: '团队名称', key: 'name', ellipsis: { tooltip: true } },
  { title: '负责人', key: 'leaderName', width: 120 },
  { title: '成员数', key: 'memberCount', width: 90 },
  {
    title: '创建时间',
    key: 'createTime',
    width: 170,
    render: row => formatTime(row.createTime)
  },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    render: row =>
      h(
        NSpace,
        { size: 8 },
        {
          default: () => [
            h(
              NButton,
              { text: true, type: 'primary', size: 'small', onClick: () => openDetail(row) },
              { default: () => '详情' }
            )
          ]
        }
      )
  }
]

const fetchTeams = async () => {
  loading.value = true
  try {
    const res = await teamListApi()
    teams.value = res?.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  createName.value = ''
  createShow.value = true
}

const confirmCreate = async () => {
  if (!createName.value) {
    window['$message'].warning('请输入团队名称')
    return
  }
  creating.value = true
  try {
    const res = await teamCreateApi({ name: createName.value })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success('团队创建成功')
      createShow.value = false
      await fetchTeams()
    }
  } finally {
    creating.value = false
  }
}

const openDetail = (row: TeamItem) => {
  detailTeamId.value = row.id
  detailShow.value = true
}

onMounted(fetchTeams)
</script>

<style lang="scss" scoped>
.go-team-manage {
  padding: 20px;
}

.manage-card {
  border-radius: 8px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
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
</style>
