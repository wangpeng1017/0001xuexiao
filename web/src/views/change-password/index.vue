<template>
  <div class="go-password-page">
    <n-card class="password-card" :bordered="false">
      <div class="password-header">
        <div class="password-icon">
          <n-icon size="24" color="#ffffff">
            <LockClosedOutlineIcon></LockClosedOutlineIcon>
          </n-icon>
        </div>
        <h2>修改密码</h2>
        <p v-if="forceChange">首次登录需要修改初始密码，修改完成后才能继续使用平台</p>
        <p v-else>为了账号安全，请定期更换密码</p>
      </div>

      <n-form
        ref="formRef"
        size="large"
        :model="formInline"
        :rules="rules"
        label-placement="top"
      >
        <n-form-item label="旧密码" path="oldPassword">
          <n-input
            v-model:value="formInline.oldPassword"
            type="password"
            show-password-on="click"
            placeholder="请输入旧密码"
          />
        </n-form-item>
        <n-form-item label="新密码" path="newPassword">
          <n-input
            v-model:value="formInline.newPassword"
            type="password"
            show-password-on="click"
            placeholder="至少 8 位，同时包含字母和数字"
          />
        </n-form-item>
        <n-form-item label="确认新密码" path="confirmPassword">
          <n-input
            v-model:value="formInline.confirmPassword"
            type="password"
            show-password-on="click"
            placeholder="请再次输入新密码"
            @keydown.enter.prevent="handleSubmit"
          />
        </n-form-item>

        <n-space vertical :size="14">
          <n-button type="primary" size="large" block :loading="loading" @click="handleSubmit">
            确认修改
          </n-button>
          <n-button v-if="!forceChange" quaternary block @click="goHome">返回项目列表</n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import type { FormInst } from 'naive-ui'
import { changePasswordApi } from '@/api/path'
import { ResultEnum } from '@/enums/httpEnum'
import { PageEnum } from '@/enums/pageEnum'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { SystemStoreEnum, SystemStoreUserInfoEnum } from '@/store/modules/systemStore/systemStore.d'
import { isMustChangePwd, routerTurnByName } from '@/utils'
import { icon } from '@/plugins'

const { LockClosedOutlineIcon } = icon.ionicons5
const systemStore = useSystemStore()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const forceChange = isMustChangePwd()

const formInline = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

const rules = {
  oldPassword: {
    required: true,
    message: '请输入旧密码',
    trigger: ['blur', 'input']
  },
  newPassword: [
    {
      required: true,
      message: '请输入新密码',
      trigger: ['blur', 'input']
    },
    {
      validator: (_rule: unknown, value: string) => passwordPattern.test(value),
      message: '新密码至少 8 位，且同时包含字母和数字',
      trigger: ['blur', 'input']
    }
  ],
  confirmPassword: [
    {
      required: true,
      message: '请再次输入新密码',
      trigger: ['blur', 'input']
    },
    {
      validator: (_rule: unknown, value: string) => value === formInline.newPassword,
      message: '两次输入的新密码不一致',
      trigger: ['blur', 'input']
    }
  ]
}

const handleSubmit = () => {
  formRef.value?.validate(async (errors: any) => {
    if (errors) return
    loading.value = true
    try {
      const res = await changePasswordApi({
        oldPassword: formInline.oldPassword,
        newPassword: formInline.newPassword
      })
      if (res && res.code === ResultEnum.SUCCESS) {
        systemStore.setItem(SystemStoreEnum.USER_INFO, {
          ...systemStore.getUserInfo,
          [SystemStoreUserInfoEnum.MUST_CHANGE_PWD]: false
        })
        window['$message'].success('密码修改成功')
        routerTurnByName(PageEnum.BASE_HOME_NAME, true)
      }
    } finally {
      loading.value = false
    }
  }).catch(() => {})
}

const goHome = () => {
  routerTurnByName(PageEnum.BASE_HOME_NAME)
}
</script>

<style lang="scss" scoped>
.go-password-page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  background:
    radial-gradient(circle at 15% 20%, rgba(81, 214, 169, 0.2), transparent 40%),
    radial-gradient(circle at 85% 75%, rgba(62, 140, 242, 0.2), transparent 45%),
    #0b1220;
}

.password-card {
  width: 430px;
  padding: 10px 6px;
  border-radius: 14px;
  background: rgba(20, 28, 43, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);

  :deep(.n-form-item-label) {
    color: rgba(255, 255, 255, 0.8);
  }
}

.password-header {
  margin-bottom: 24px;
  text-align: center;

  h2 {
    margin: 14px 0 8px;
    font-size: 22px;
    color: #ffffff;
  }

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.55);
  }
}

.password-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #51d6a9, #3e8cf2);
}
</style>
