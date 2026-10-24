<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    style="width: 440px"
    :bordered="false"
    @update:show="close"
  >
    <n-space vertical :size="16">
      <n-alert type="warning" :show-icon="false">
        初始密码只在此处显示一次，请复制后通过安全渠道告知用户。用户首次登录时会被要求修改密码。
      </n-alert>
      <div class="password-box">
        <span class="password-text">{{ password }}</span>
      </div>
      <n-space justify="end">
        <n-button @click="close">关闭</n-button>
        <n-button type="primary" @click="copyPassword">复制密码</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script lang="ts" setup>
import { useClipboard } from '@vueuse/core'

const props = defineProps({
  show: Boolean,
  title: {
    type: String,
    default: '初始密码'
  },
  password: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:show'])

const { copy, isSupported } = useClipboard({ legacy: true })

const close = () => {
  emit('update:show', false)
}

const copyPassword = async () => {
  if (!isSupported.value) {
    window['$message'].error('当前浏览器不支持自动复制，请手动复制')
    return
  }
  await copy(props.password)
  window['$message'].success('密码已复制到剪贴板')
}
</script>

<style lang="scss" scoped>
.password-box {
  padding: 18px;
  text-align: center;
  border-radius: 8px;
  background: rgba(81, 214, 169, 0.12);
  border: 1px dashed rgba(81, 214, 169, 0.6);
}

.password-text {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 3px;
  font-family: Consolas, Monaco, monospace;
}
</style>
