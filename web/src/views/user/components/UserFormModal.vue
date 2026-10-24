<template>
  <n-modal v-model:show="visible" preset="card" :title="isEdit ? '编辑用户' : '新建用户'" style="width: 480px">
    <n-form ref="formRef" :model="formInline" :rules="rules" label-placement="left" label-width="90">
      <n-form-item label="用户名" path="username">
        <n-input
          v-model:value="formInline.username"
          :disabled="isEdit"
          maxlength="32"
          placeholder="4~32 位字母、数字或下划线"
        />
      </n-form-item>
      <n-form-item label="姓名" path="nickname">
        <n-input v-model:value="formInline.nickname" maxlength="50" placeholder="请输入姓名" />
      </n-form-item>
      <n-form-item label="角色" path="role">
        <n-select
          v-model:value="formInline.role"
          :options="roleOptions"
          :disabled="isSelf"
          placeholder="请选择角色"
        />
      </n-form-item>
      <n-form-item v-if="!isEdit" label="初始密码">
        <n-input
          v-model:value="formInline.password"
          type="password"
          show-password-on="click"
          maxlength="64"
          placeholder="留空由系统生成 10 位随机密码"
        />
      </n-form-item>
      <n-form-item v-if="isEdit" label="账号状态">
        <n-space align="center">
          <n-switch v-model:value="enabled" :disabled="isSelf" />
          <n-text depth="3">{{ enabled ? '启用' : '禁用' }}</n-text>
        </n-space>
      </n-form-item>
      <n-alert v-if="isSelf && isEdit" type="info" :show-icon="false">
        不能禁用自己或修改自己的角色
      </n-alert>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="close">取消</n-button>
        <n-button type="primary" :loading="loading" @click="handleSubmit">确定</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue'
import type { PropType } from 'vue'
import type { FormInst } from 'naive-ui'
import { createUserApi, editUserApi } from '@/api/path'
import { ResultEnum } from '@/enums/httpEnum'
import { roleOptions } from '@/enums/roleEnum'
import type { UserRole } from '@/store/modules/systemStore/systemStore.d'
import type { UserItem } from '@/api/path/user'

const props = defineProps({
  show: Boolean,
  user: {
    type: Object as PropType<UserItem | null>,
    default: null
  },
  currentUserId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:show', 'success'])
const visible = computed({
  get: () => props.show,
  set: value => emit('update:show', value)
})

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const enabled = ref(true)
const isEdit = computed(() => !!props.user?.id)
const isSelf = computed(() => props.user?.id === props.currentUserId)

const formInline = reactive({
  username: '',
  nickname: '',
  role: 'teacher' as UserRole,
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: ['blur', 'input'] },
    {
      pattern: /^[A-Za-z0-9_]{4,32}$/,
      message: '用户名需为 4~32 位字母、数字或下划线',
      trigger: ['blur', 'input']
    }
  ],
  nickname: [{ required: true, message: '请输入姓名', trigger: ['blur', 'input'] }],
  role: [{ required: true, message: '请选择角色', trigger: ['blur', 'change'] }]
}

watch(
  () => props.show,
  show => {
    if (!show) return
    const user = props.user
    formInline.username = user?.username || ''
    formInline.nickname = user?.nickname || ''
    formInline.role = user?.role || 'teacher'
    formInline.password = ''
    enabled.value = !(user?.disabled ?? false)
  }
)

const close = () => {
  visible.value = false
}

const handleSubmit = () => {
  formRef.value?.validate(async (errors: any) => {
    if (errors) return
    loading.value = true
    try {
      if (isEdit.value && props.user) {
        const payload: { id: string; nickname: string; role?: UserRole; disabled?: boolean } = {
          id: props.user.id,
          nickname: formInline.nickname
        }
        if (!isSelf.value) {
          payload.role = formInline.role
          payload.disabled = !enabled.value
        }
        const res = await editUserApi(payload)
        if (res && res.code === ResultEnum.SUCCESS) {
          window['$message'].success('用户信息已更新')
          emit('success')
          close()
        }
        return
      }

      const res = await createUserApi({
        username: formInline.username,
        nickname: formInline.nickname,
        role: formInline.role,
        password: formInline.password || undefined
      })
      if (res && res.code === ResultEnum.SUCCESS && res.data) {
        window['$message'].success('用户创建成功')
        emit('success', { initialPassword: res.data.initialPassword, username: formInline.username })
        close()
      }
    } finally {
      loading.value = false
    }
  }).catch(() => {})
}
</script>
