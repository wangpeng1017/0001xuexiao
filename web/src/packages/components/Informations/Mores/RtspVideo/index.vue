<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="go-rtsp-video" @click="handleVideoClick">
    <video
      ref="videoRef"
      class="rtsp-player"
      playsinline
      :muted="muted"
      :style="{ objectFit: fit }"
      @playing="playBlocked = false"
    ></video>
    <div v-if="!streamId" class="rtsp-mask hint">
      <warning-outline class="mask-icon" />
      <span>请在右侧配置 RTSP 地址并点击“连接”</span>
    </div>
    <div v-else-if="errorMsg" class="rtsp-mask error">
      <warning-outline class="mask-icon" />
      <span>{{ errorMsg }}</span>
    </div>
    <div v-else-if="playBlocked" class="rtsp-mask hint">
      <span>浏览器阻止了自动播放，点击画面开始播放</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type PropType } from 'vue'
import mpegts from 'mpegts.js'
import { WarningOutline } from '@vicons/ionicons5'
import { CreateComponentType } from '@/packages/index.d'

const props = defineProps({
  chartConfig: {
    type: Object as PropType<CreateComponentType>,
    required: true
  }
})

const videoRef = ref<HTMLVideoElement | null>(null)
const errorMsg = ref('')
const playBlocked = ref(false)
const streamId = computed(() => props.chartConfig.option?.streamId || '')
const fit = computed(() => props.chartConfig.option?.fit || 'contain')
const autoplay = computed(() => props.chartConfig.option?.autoplay !== false)
const muted = computed(() => props.chartConfig.option?.muted !== false)

let player: ReturnType<typeof mpegts.createPlayer> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let disposed = false

function destroyPlayer() {
  if (!player) return
  try {
    player.pause()
    player.unload()
    player.detachMediaElement()
    player.destroy()
  } catch {
    // 忽略销毁阶段的异常
  }
  player = null
}

function scheduleReconnect() {
  if (disposed || !streamId.value) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    initPlayer()
  }, 5000)
}

function initPlayer() {
  destroyPlayer()
  errorMsg.value = ''
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (!streamId.value || !videoRef.value) return
  playBlocked.value = false
  if (!mpegts.isSupported()) {
    errorMsg.value = '当前浏览器不支持 MSE 直播播放'
    return
  }

  const playerInstance = mpegts.createPlayer(
    {
      type: 'flv',
      isLive: true,
      url: `/api/goview/open/video/${streamId.value}.flv`
    },
    {
      enableStashBuffer: false,
      stashInitialSize: 128,
      liveBufferLatencyChasing: true,
      autoCleanupSourceBuffer: true,
      lazyLoad: false
    }
  )
  player = playerInstance
  playerInstance.attachMediaElement(videoRef.value)
  playerInstance.load()
  playerInstance.on(mpegts.Events.ERROR, () => {
    if (disposed) return
    errorMsg.value = '视频流连接失败，5 秒后自动重连'
    destroyPlayer()
    scheduleReconnect()
  })
  if (autoplay.value) {
    playerInstance.play().catch(() => {
      if (!disposed && !errorMsg.value) playBlocked.value = true
    })
  }
}

function handleVideoClick() {
  playBlocked.value = false
  videoRef.value?.play().catch(() => undefined)
}

watch(
  () => props.chartConfig.option?.streamId,
  () => {
    if (videoRef.value) initPlayer()
  }
)

watch(
  () => [props.chartConfig.option?.autoplay, props.chartConfig.option?.muted],
  () => {
    if (videoRef.value) {
      videoRef.value.muted = muted.value
      if (autoplay.value) videoRef.value.play().catch(() => undefined)
    }
  },
  { deep: true }
)

onMounted(() => {
  disposed = false
  initPlayer()
})

onUnmounted(() => {
  disposed = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  destroyPlayer()
})
</script>

<style lang="scss" scoped>
@include go('rtsp-video') {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  .rtsp-player {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
  }
  .rtsp-mask {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    padding: 12px;
    text-align: center;
    color: #d8d8d8;
    font-size: 13px;
    background: rgba(0, 0, 0, 0.55);
    .mask-icon {
      width: 28px;
      height: 28px;
    }
    &.error {
      color: #ffb4b4;
    }
  }
}
</style>
