<template>
  <n-drawer :show="show" :width="560" placement="right" @update:show="emit('update:show', $event)">
    <n-drawer-content :title="detail?.name || '团队详情'" closable>
      <n-spin :show="detailLoading">
        <div v-if="detail" class="detail-box">
          <div class="detail-head">
            <n-input
              v-if="isManager"
              v-model:value.trim="teamNameInput"
              maxlength="50"
              style="width: 260px"
            />
            <n-text v-else strong>{{ detail.name }}</n-text>
            <n-button v-if="isManager" size="small" secondary @click="saveName">
              保存名称
            </n-button>
          </div>

          <div class="detail-meta">
            <n-text depth="3">负责人：{{ detail.leaderName }}</n-text>
            <n-text depth="3">成员 {{ detail.memberCount }} 人</n-text>
            <n-text depth="3">创建于 {{ formatTime(detail.createTime) }}</n-text>
          </div>

          <n-divider title-placement="left">成员列表</n-divider>
          <n-data-table
            :columns="memberColumns"
            :data="detail.members"
            :row-key="(row: TeamMemberItem) => row.userId"
            :bordered="false"
            size="small"
          />

          <template v-if="isManager">
            <n-divider title-placement="left">添加成员</n-divider>
            <div class="member-add">
              <n-select
                v-model:value="selectedUserIds"
                multiple
                filterable
                remote
                clearable
                :options="memberOptions"
                :loading="optionsLoading"
                placeholder="搜索用户名或姓名"
                @search="loadOptions"
              />
              <n-button type="primary" :loading="adding" @click="confirmAddMembers">
                添加
              </n-button>
            </div>

            <n-divider title-placement="left">更换负责人</n-divider>
            <div class="member-add">
              <n-select
                v-model:value="newLeaderId"
                :options="leaderOptions"
                placeholder="选择新的负责人"
              />
              <n-button secondary :loading="changingLeader" @click="confirmChangeLeader">
                更换
              </n-button>
            </div>
          </template>
        </div>
        <n-empty v-else description="暂无数据" />
      </n-spin>
      <template #footer>
        <n-space justify="space-between">
          <n-button
            v-if="detail && isManager"
            type="error"
            secondary
            @click="confirmDelete"
          >
            删除团队
          </n-button>
          <n-button @click="emit('update:show', false)">关闭</n-button>
        </n-space>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script lang="ts" setup>
import { computed, h, ref, watch } from 'vue'
import { NButton, NTag, type DataTableColumns } from 'naive-ui'
import dayjs from 'dayjs'
import {
  teamAddMembersApi,
  teamDeleteApi,
  teamDetailApi,
  teamEditApi,
  teamRemoveMemberApi,
  userOptionsApi
} from '@/api/path'
import type { TeamDetail, TeamMemberItem, UserOption } from '@/api/path/team'
import { roleLabelMap, RoleEnum } from '@/enums/roleEnum'
import { ResultEnum } from '@/enums/httpEnum'
import { DialogEnum } from '@/enums/pluginEnum'
import { goDialog, getStoredRole } from '@/utils'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'

const props = defineProps<{ show: boolean; teamId: string | null }>()
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'changed'): void
}>()

const systemStore = useSystemStore()
const role = getStoredRole()
const isAdmin = role === RoleEnum.ADMIN
const currentUserId = computed(() => systemStore.getUserInfo.userId || '')

const detailLoading = ref(false)
const detail = ref<TeamDetail | null>(null)
const teamNameInput = ref('')
const newLeaderId = ref<string | null>(null)
const selectedUserIds = ref<string[]>([])
const userOptions = ref<UserOption[]>([])
const optionsLoading = ref(false)
const adding = ref(false)
const changingLeader = ref(false)

const isManager = computed(() => {
  if (!detail.value) return false
  return isAdmin || detail.value.leaderId === currentUserId.value
})

const leaderOptions = computed(() =>
  (detail.value?.members || []).map(member => ({
    label: `${member.nickname}（${member.username}）`,
    value: member.userId
  }))
)

const memberOptions = computed(() => {
  const existing = new Set((detail.value?.members || []).map(member => member.userId))
  return userOptions.value
    .filter(user => !existing.has(user.id))
    .map(user => ({
      label: `${user.nickname}（${user.username}·${roleLabelMap[user.role as keyof typeof roleLabelMap] || user.role}）`,
      value: user.id
    }))
})

const formatTime = (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-')

const memberColumns: DataTableColumns<TeamMemberItem> = [
  { title: '姓名', key: 'nickname' },
  { title: '用户名', key: 'username' },
  {
    title: '角色',
    key: 'role',
    width: 80,
    render: row => roleLabelMap[row.role as keyof typeof roleLabelMap] || row.role
  },
  {
    title: '',
    key: 'leader',
    width: 70,
    render: row =>
      detail.value?.leaderId === row.userId
        ? h(NTag, { type: 'success', size: 'small', bordered: false }, { default: () => '负责人' })
        : null
  },
  {
    title: '操作',
    key: 'actions',
    width: 70,
    render: row => {
      if (!isManager.value || detail.value?.leaderId === row.userId) return null
      return h(
        NButton,
        { text: true, type: 'error', size: 'small', onClick: () => confirmRemove(row) },
        { default: () => '移除' }
      )
    }
  }
]

const loadDetail = async () => {
  if (!props.teamId) return
  detailLoading.value = true
  selectedUserIds.value = []
  userOptions.value = []
  try {
    const res = await teamDetailApi(props.teamId)
    if (res && res.data) {
      detail.value = res.data
      teamNameInput.value = res.data.name
      newLeaderId.value = res.data.leaderId
    }
  } finally {
    detailLoading.value = false
  }
}

watch(
  () => [props.show, props.teamId] as const,
  ([show]) => {
    if (show) loadDetail()
  }
)

const refreshDetail = async () => {
  if (!detail.value) return
  const res = await teamDetailApi(detail.value.id)
  if (res && res.data) {
    detail.value = res.data
    teamNameInput.value = res.data.name
    newLeaderId.value = res.data.leaderId
    emit('changed')
  }
}

const saveName = async () => {
  if (!detail.value) return
  if (!teamNameInput.value) {
    window['$message'].warning('团队名称不能为空')
    return
  }
  const res = await teamEditApi({ id: detail.value.id, name: teamNameInput.value })
  if (res && res.code === ResultEnum.SUCCESS) {
    window['$message'].success('团队名称已更新')
    await refreshDetail()
  }
}

const loadOptions = async (keyword: string) => {
  optionsLoading.value = true
  try {
    const res = await userOptionsApi(keyword)
    userOptions.value = res?.data || []
  } finally {
    optionsLoading.value = false
  }
}

const confirmAddMembers = async () => {
  if (!detail.value || selectedUserIds.value.length === 0) {
    window['$message'].warning('请选择要添加的成员')
    return
  }
  adding.value = true
  try {
    const res = await teamAddMembersApi({
      id: detail.value.id,
      userIds: selectedUserIds.value
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success('成员已添加')
      selectedUserIds.value = []
      await refreshDetail()
    }
  } finally {
    adding.value = false
  }
}

const confirmRemove = (member: TeamMemberItem) => {
  if (!detail.value) return
  goDialog({
    type: DialogEnum.DELETE,
    message: `确定将「${member.nickname}」移出团队吗？`,
    promise: true,
    onPositiveCallback: () =>
      teamRemoveMemberApi({ id: detail.value!.id, userId: member.userId }),
    promiseResCallback: async (res: any) => {
      if (res && res.code === ResultEnum.SUCCESS) {
        window['$message'].success('成员已移除')
        await refreshDetail()
      }
    }
  })
}

const confirmChangeLeader = async () => {
  if (!detail.value || !newLeaderId.value) {
    window['$message'].warning('请选择新的负责人')
    return
  }
  changingLeader.value = true
  try {
    const res = await teamEditApi({ id: detail.value.id, leaderId: newLeaderId.value })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success('负责人已更换')
      await refreshDetail()
    }
  } finally {
    changingLeader.value = false
  }
}

const confirmDelete = () => {
  if (!detail.value) return
  const team = detail.value
  emit('update:show', false)
  goDialog({
    type: DialogEnum.DELETE,
    message: `确定删除团队「${team.name}」吗？删除后团队成员将失去团队项目的访问权限，项目会归创建者个人所有。`,
    promise: true,
    onPositiveCallback: () => teamDeleteApi(team.id),
    promiseResCallback: async (res: any) => {
      if (res && res.code === ResultEnum.SUCCESS) {
        window['$message'].success('团队已删除')
        emit('changed')
      }
    }
  })
}
</script>

<style lang="scss" scoped>
.detail-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
}

.member-add {
  display: flex;
  gap: 10px;
  align-items: center;

  :deep(.n-select) {
    flex: 1;
  }
}
</style>
