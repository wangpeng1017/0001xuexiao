<!-- eslint-disable vue/multi-word-component-names -->
<!-- eslint-disable vue/no-mutating-props -->
<template>
  <collapse-item name="摄像头视频" expanded>
    <setting-item-box name="视频源" alone>
      <setting-item name="RTSP 地址">
        <n-input
          v-model:value="optionData.rtspUrl"
          size="small"
          placeholder="rtsp://用户名:密码@摄像头地址"
        ></n-input>
      </setting-item>
      <n-space vertical size="small" style="margin-top: 8px">
        <n-button
          size="small"
          type="primary"
          :loading="connecting"
          :disabled="!optionData.rtspUrl"
          @click="connect"
        >
          {{ optionData.streamId ? '重新连接' : '连接' }}
        </n-button>
        <div v-if="optionData.streamId" class="stream-info">
          <n-tag type="success" size="small" :bordered="false">已连接</n-tag>
          <span class="stream-id">streamId: {{ optionData.streamId }}</span>
        </div>
        <div v-else class="stream-tip">
          点击连接后后端会登记视频源并返回 streamId，保存大屏后即可播放。
        </div>
        <div class="stream-tip">
          开发模式下可通过 VIDEO_ALLOW_FILE=1 使用本地视频文件代替 RTSP。
        </div>
      </n-space>
    </setting-item-box>

    <setting-item-box name="控制">
      <setting-item>
        <n-checkbox v-model:checked="optionData.autoplay" size="small">自动播放</n-checkbox>
      </setting-item>
      <setting-item>
        <n-checkbox v-model:checked="optionData.muted" size="small">静音</n-checkbox>
      </setting-item>
    </setting-item-box>

    <setting-item-box name="样式">
      <setting-item name="适应方式">
        <n-select v-model:value="optionData.fit" size="small" :options="fitList"></n-select>
      </setting-item>
    </setting-item-box>
  </collapse-item>
</template>

<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { http } from '@/api/http'
import { RequestHttpEnum } from '@/enums/httpEnum'
import { option } from './config'
import { CollapseItem, SettingItemBox, SettingItem } from '@/components/Pages/ChartItemSetting'

const props = defineProps({
  optionData: {
    type: Object as PropType<typeof option>,
    required: true
  }
})

const optionData = props.optionData
const connecting = ref(false)
const streamId = computed(() => optionData.streamId)

const fitList = [
  { value: 'contain', label: 'contain（完整显示）' },
  { value: 'cover', label: 'cover（裁剪填满）' },
  { value: 'fill', label: 'fill（拉伸填满）' }
]

async function connect() {
  const rtspUrl = (optionData.rtspUrl || '').trim()
  if (!rtspUrl) {
    window['$message'].error('请先填写 RTSP 地址')
    return
  }
  connecting.value = true
  try {
    const res = await http(RequestHttpEnum.POST)<{ streamId: string }>('video/register', {
      rtspUrl
    })
    if (res && res.code === 200 && res.data?.streamId) {
      optionData.streamId = res.data.streamId
      window['$message'].success('连接成功，已登记视频源')
    } else if (res?.msg) {
      window['$message'].error(res.msg)
    }
  } catch {
    window['$message'].error('连接失败，请检查后端服务')
  } finally {
    connecting.value = false
  }
}
</script>

<style lang="scss" scoped>
.stream-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  .stream-id {
    font-size: 12px;
    color: #8a8f99;
    word-break: break-all;
  }
}
.stream-tip {
  color: #8a8f99;
  font-size: 12px;
  line-height: 1.5;
}
</style>
