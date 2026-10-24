<template>
  <div class="go-login-box">
    <div class="go-login-bg"></div>
    <div class="go-login-content">
      <div class="go-login-brand">
        <div class="brand-icon">
          <n-icon size="28" color="#ffffff">
            <AnalyticsIcon></AnalyticsIcon>
          </n-icon>
        </div>
        <h1 class="brand-title">多源数据融合可视化平台</h1>
        <p class="brand-desc">拖拽搭建 · 多源接入 · 离线部署</p>
      </div>

      <n-card class="go-login-card" :bordered="false">
        <n-form
          ref="formRef"
          size="large"
          :model="formInline"
          :rules="rules"
          :show-label="false"
          @keydown.enter.prevent="handleSubmit"
        >
          <n-form-item path="username">
            <n-input
              v-model:value="formInline.username"
              type="text"
              maxlength="32"
              placeholder="请输入用户名"
              :input-props="{ autocomplete: 'username' }"
            >
              <template #prefix>
                <n-icon size="18">
                  <PersonOutlineIcon></PersonOutlineIcon>
                </n-icon>
              </template>
            </n-input>
          </n-form-item>
          <n-form-item path="password">
            <n-input
              v-model:value="formInline.password"
              type="password"
              maxlength="64"
              show-password-on="click"
              placeholder="请输入密码"
              :input-props="{ autocomplete: 'current-password' }"
            >
              <template #prefix>
                <n-icon size="18">
                  <LockClosedOutlineIcon></LockClosedOutlineIcon>
                </n-icon>
              </template>
            </n-input>
          </n-form-item>

          <n-button type="primary" size="large" block :loading="loading" @click="handleSubmit">
            登录
          </n-button>
        </n-form>
      </n-card>

      <div class="go-login-footer">多源数据融合可视化平台</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { SystemStoreUserInfoEnum, SystemStoreEnum } from '@/store/modules/systemStore/systemStore.d'
import { PageEnum } from '@/enums/pageEnum'
import { icon } from '@/plugins'
import { routerTurnByName } from '@/utils'
import { loginApi } from '@/api/path'

const { PersonOutlineIcon, LockClosedOutlineIcon, AnalyticsIcon } = icon.ionicons5

const formRef = ref()
const loading = ref(false)
const systemStore = useSystemStore()

const formInline = reactive({
  username: '',
  password: ''
})

const rules = {
  username: {
    required: true,
    message: '请输入用户名',
    trigger: ['blur', 'input']
  },
  password: {
    required: true,
    message: '请输入密码',
    trigger: ['blur', 'input']
  }
}

const handleSubmit = (e?: Event) => {
  e?.preventDefault()
  formRef.value?.validate(async (errors: any) => {
    if (errors) return
    loading.value = true
    try {
      const { username, password } = formInline
      const res = await loginApi({ username, password })
      if (res && res.data) {
        const { tokenValue, tokenName } = res.data.token
        const { nickname, username: userName, id, role, mustChangePwd } = res.data.userinfo

        systemStore.setItem(SystemStoreEnum.USER_INFO, {
          [SystemStoreUserInfoEnum.USER_TOKEN]: tokenValue,
          [SystemStoreUserInfoEnum.TOKEN_NAME]: tokenName,
          [SystemStoreUserInfoEnum.USER_ID]: id,
          [SystemStoreUserInfoEnum.USER_NAME]: userName,
          [SystemStoreUserInfoEnum.NICK_NAME]: nickname,
          [SystemStoreUserInfoEnum.ROLE]: role,
          [SystemStoreUserInfoEnum.MUST_CHANGE_PWD]: mustChangePwd
        })

        window['$message'].success('登录成功！')
        if (mustChangePwd) {
          routerTurnByName(PageEnum.CHANGE_PASSWORD_NAME, true)
        } else {
          routerTurnByName(PageEnum.BASE_HOME_NAME, true)
        }
      }
    } finally {
      loading.value = false
    }
  }).catch(() => {})
}
</script>

<style lang="scss" scoped>
.go-login-box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #0b1220;
}

.go-login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 15% 20%, rgba(81, 214, 169, 0.25), transparent 40%),
    radial-gradient(circle at 85% 75%, rgba(62, 140, 242, 0.25), transparent 45%),
    linear-gradient(135deg, #0b1220 0%, #111c33 55%, #0a1a2b 100%);
}

.go-login-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 380px;
}

.go-login-brand {
  margin-bottom: 28px;
  text-align: center;
  color: #ffffff;
}

.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, #51d6a9, #3e8cf2);
}

.brand-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 1px;
}

.brand-desc {
  margin: 10px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 2px;
}

.go-login-card {
  width: 100%;
  padding: 8px 4px;
  border-radius: 14px;
  background: rgba(20, 28, 43, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.go-login-footer {
  margin-top: 22px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}
</style>
