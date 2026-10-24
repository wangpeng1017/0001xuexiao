<template>
  <n-dropdown
    trigger="hover"
    @select="handleSelect"
    :show-arrow="true"
    :options="options"
  >
    <div class="user-info-box">
      <person-icon v-if="fallback"></person-icon>
      <n-avatar
        v-if="!fallback"
        round
        object-fit="cover"
        size="medium"
        :src="Person"
        @error="errorHandle"
      ></n-avatar>
      <span class="user-name">{{ displayName }}</span>
    </div>
  </n-dropdown>
</template>

<script lang="ts" setup>
import { computed, h, ref } from 'vue'
import { NAvatar, NText, NTag } from 'naive-ui'
import { renderIcon, routerTurnByName } from '@/utils'
import { logout } from '@/utils'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { SystemStoreUserInfoEnum } from '@/store/modules/systemStore/systemStore.d'
import { roleLabelMap } from '@/enums/roleEnum'
import { PageEnum } from '@/enums/pageEnum'
import Person from './person.png'

import { icon } from '@/plugins'
const { PersonIcon, LogOutOutlineIcon, LockClosedOutlineIcon } = icon.ionicons5

const systemStore = useSystemStore()
const fallback = ref(false)
const displayName = computed(() => {
  return systemStore.getUserInfo[SystemStoreUserInfoEnum.NICK_NAME]
    || systemStore.getUserInfo[SystemStoreUserInfoEnum.USER_NAME]
    || '用户'
})
const roleLabel = computed(() => {
  const role = systemStore.getUserInfo[SystemStoreUserInfoEnum.ROLE]
  return role ? roleLabelMap[role] : ''
})

const renderUserInfo = () => {
  return h(
    'div',
    {
      style: 'display: flex; align-items: center; padding: 8px 12px; min-width: 180px;'
    },
    [
      h(NAvatar, {
        round: true,
        style: 'margin-right: 12px;',
        src: Person
      }),
      h('div', null, [
        h('div', { style: 'font-weight: 500;' }, displayName.value),
        h(
          'div',
          { style: 'margin-top: 4px;' },
          [
            h(NTag, { size: 'small', type: 'info', bordered: false }, {
              default: () => h(NText, { depth: 2 }, { default: () => roleLabel.value || '未分配角色' })
            })
          ]
        )
      ])
    ]
  )
}

const options = computed(() => [
  {
    label: '账号信息',
    key: 'info',
    type: 'render',
    render: renderUserInfo
  },
  {
    type: 'divider',
    key: 'd1'
  },
  {
    label: '修改密码',
    key: 'changePassword',
    icon: renderIcon(LockClosedOutlineIcon)
  },
  {
    type: 'divider',
    key: 'd2'
  },
  {
    label: '退出登录',
    key: 'logout',
    icon: renderIcon(LogOutOutlineIcon)
  }
])

const errorHandle = () => {
  fallback.value = true
}

const handleSelect = (key: string) => {
  switch (key) {
    case 'changePassword':
      routerTurnByName(PageEnum.CHANGE_PASSWORD_NAME)
      break
    case 'logout':
      logout()
      break
  }
}
</script>

<style lang="scss" scoped>
.user-info-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 8px;
  cursor: pointer;
}

.user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
</style>
