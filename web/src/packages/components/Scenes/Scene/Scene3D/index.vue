<template>
  <div
    ref="rootRef"
    class="go-scene3d"
    data-testid="scene3d-root"
    :data-layer-count="layerCount"
    :data-scene-mode="currentMode"
    :data-camera="savedCameraAttr"
    :data-ready="ready ? '1' : '0'"
  >
    <div
      ref="containerRef"
      class="scene-canvas"
      @mousedown.stop="handleCanvasMouseDown"
      @pointerdown.stop
      @dblclick.stop
      @wheel.stop
      @click.stop="handleCanvasClick"
      @contextmenu.prevent.stop="handleCanvasContextMenu"
    ></div>

    <scene-mode-toolbar
      :editable="isEditor"
      :interactive="interactive"
      @toggle-interactive="toggleInteractive"
    ></scene-mode-toolbar>

    <div v-if="picking" class="scene-pick-hint" data-testid="scene-pick-hint">
      单击地图选择位置，右键或 Esc 取消
    </div>

    <div v-if="errorItems.length" class="scene-error-box" data-testid="scene-error-box">
      <div v-for="item in errorItems" :key="item.id" class="scene-error-item">
        {{ item.name }}：{{ item.message }}
      </div>
    </div>

    <div v-if="!ready" class="scene-loading">三维场景加载中…</div>

    <teleport to="body">
      <panorama-viewer
        v-if="activePanorama"
        :image-url="activePanorama.imageUrl"
        :title="activePanorama.name"
        @close="activePanorama = null"
      ></panorama-viewer>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import '@/components/Scene3D/cesiumEnv'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  PropType,
  ref,
  watch
} from 'vue'
import { Cartesian2, Viewer } from 'cesium'
import { CreateComponentType } from '@/packages/index.d'
import { DEFAULT_CAMERA } from '@/components/Scene3D/defaults'
import { createSceneViewer } from '@/components/Scene3D/viewer'
import { SceneSyncer } from '@/components/Scene3D/sync'
import {
  applyCamera,
  captureCamera,
  getSceneMode,
  pickGlobePosition,
  setSceneMode
} from '@/components/Scene3D/camera'
import { getPanoramaPointFromEntity } from '@/components/Scene3D/layerFactories/panorama'
import {
  registerSceneController,
  SceneControllerApi,
  unregisterSceneController
} from '@/components/Scene3D/registry'
import { normalizeSceneMode, PanoramaPoint, Scene3DOption, SceneMode } from '@/components/Scene3D/types'
import SceneModeToolbar from '@/components/Scene3D/components/SceneModeToolbar.vue'

const PanoramaViewer = defineAsyncComponent(() => import('@/components/Scene3D/components/PanoramaViewer.vue'))

const props = defineProps({
  chartConfig: {
    type: Object as PropType<CreateComponentType>,
    required: true
  }
})

const optionRef = props.chartConfig.option as unknown as Scene3DOption
const rootRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const ready = ref(false)
const currentMode = ref<SceneMode>(normalizeSceneMode(optionRef.sceneMode))
const morphing = ref(false)
const isEditor = ref(false)
const interactive = ref(false)
const picking = ref(false)
const activePanorama = ref<PanoramaPoint | null>(null)
const layerErrors = ref<Record<string, string>>({})

let viewer: Viewer | null = null
let syncer: SceneSyncer | null = null
let shapeModal: HTMLElement | null = null
let mouseDownPoint: { x: number; y: number } | null = null
let pickCallback: ((position: { lon: number; lat: number; height: number }) => void) | null = null
let interactiveBeforePick = false
let syncTimer: ReturnType<typeof setTimeout> | undefined
let resizeFrame = 0
let resizeObserver: ResizeObserver | null = null
let disposed = false
let controllerRef: SceneControllerApi | null = null

const layerCount = computed(() =>
  (optionRef.layerSets || []).reduce((total, set) => total + (set.layers?.length || 0), 0)
)

const savedCameraAttr = computed(() => {
  const camera = { ...DEFAULT_CAMERA, ...(optionRef.camera || {}) }
  return [camera.lon, camera.lat, camera.height, camera.heading, camera.pitch, camera.roll].join(',')
})

const errorItems = computed(() => {
  const names = new Map<string, string>()
  for (const set of optionRef.layerSets || []) {
    for (const layer of set.layers || []) names.set(layer.id, layer.name)
  }
  return Object.entries(layerErrors.value).map(([id, message]) => ({
    id,
    name: names.get(id) || '图层',
    message
  }))
})

const readCamera = () => ({ ...DEFAULT_CAMERA, ...(optionRef.camera || {}) })

const setEditorInteractive = (value: boolean) => {
  interactive.value = value
  if (shapeModal) shapeModal.style.pointerEvents = value ? 'none' : ''
  if (viewer && !viewer.isDestroyed()) {
    viewer.scene.canvas.style.cursor = value ? 'grab' : 'auto'
  }
}

const toggleInteractive = () => {
  if (!isEditor.value) return
  setEditorInteractive(!interactive.value)
}

const finishPick = () => {
  pickCallback = null
  picking.value = false
  if (viewer && !viewer.isDestroyed()) viewer.scene.canvas.style.cursor = 'auto'
  setEditorInteractive(interactiveBeforePick)
}

const startPick = (callback: (position: { lon: number; lat: number; height: number }) => void) => {
  if (!viewer || viewer.isDestroyed()) return
  interactiveBeforePick = interactive.value
  pickCallback = callback
  picking.value = true
  setEditorInteractive(true)
  if (!viewer.isDestroyed()) viewer.scene.canvas.style.cursor = 'crosshair'
}

const cancelPick = () => {
  if (!pickCallback) return
  finishPick()
  window['$message'].info('已取消位置拾取')
}

const openPanorama = (point: PanoramaPoint) => {
  if (!point.imageUrl) {
    window['$message'].warning('该街景点未配置全景图')
    return
  }
  activePanorama.value = point
}

const handleCanvasMouseDown = (event: MouseEvent) => {
  mouseDownPoint = { x: event.clientX, y: event.clientY }
}

const handleCanvasContextMenu = () => {
  if (picking.value) finishPick()
}

// GoView 编辑器/预览会对画布做 CSS 缩放，Cesium 的事件坐标没有考虑 transform，需要手动换算
const toCanvasPosition = (event: MouseEvent) => {
  if (!viewer || viewer.isDestroyed()) return null
  const canvas = viewer.scene.canvas
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = ((event.clientX - rect.left) * canvas.clientWidth) / rect.width
  const y = ((event.clientY - rect.top) * canvas.clientHeight) / rect.height
  return {
    x: Math.min(Math.max(x, 0), canvas.clientWidth - 1),
    y: Math.min(Math.max(y, 0), canvas.clientHeight - 1)
  }
}

const handleCanvasClick = (event: MouseEvent) => {
  if (!viewer || viewer.isDestroyed()) return
  const down = mouseDownPoint
  mouseDownPoint = null
  if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return
  const screenPosition = toCanvasPosition(event)
  if (!screenPosition) return

  if (pickCallback) {
    const position = pickGlobePosition(viewer, screenPosition)
    if (!position) {
      window['$message'].warning('没有拾取到位置，请点击地球表面')
      return
    }
    const callback = pickCallback
    finishPick()
    callback(position)
    return
  }
  const picked = viewer.scene.pick(new Cartesian2(screenPosition.x, screenPosition.y))
  const point = getPanoramaPointFromEntity(picked?.id)
  if (point) openPanorama(point)
}

const changeMode = (mode: SceneMode) => {
  if (!viewer || viewer.isDestroyed() || mode === currentMode.value) return
  morphing.value = true
  currentMode.value = mode
  optionRef.sceneMode = mode
  setSceneMode(viewer, mode, 1.2)
}

const scheduleSync = () => {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = undefined
    if (!disposed) syncer?.sync(optionRef)
  }, 120)
}

const setupMorphEvents = () => {
  if (!viewer) return
  viewer.scene.morphStart.addEventListener(() => {
    morphing.value = true
  })
  viewer.scene.morphComplete.addEventListener(() => {
    morphing.value = false
    if (viewer && !viewer.isDestroyed()) currentMode.value = getSceneMode(viewer)
  })
}

const onWindowKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && picking.value) {
    finishPick()
  }
}

onMounted(async () => {
  const shapeBox = rootRef.value?.closest('.go-shape-box')
  isEditor.value = !!shapeBox
  shapeModal = (shapeBox?.querySelector('.shape-modal') as HTMLElement | null) || null

  if (!containerRef.value) return
  viewer = createSceneViewer(containerRef.value)
  syncer = new SceneSyncer(viewer, {
    onLayerError: (layerId, message) => {
      const next = { ...layerErrors.value }
      if (message) next[layerId] = message
      else delete next[layerId]
      layerErrors.value = next
    }
  })

  const controller = {
    option: optionRef,
    captureCamera: () => (viewer && !viewer.isDestroyed() ? captureCamera(viewer) : null),
    applyCamera: (camera: typeof optionRef.camera, duration = 1.2) => {
      if (viewer && !viewer.isDestroyed()) applyCamera(viewer, camera, duration)
    },
    startPickPosition: startPick,
    cancelPick,
    flyToLayer: (layerId: string) => syncer?.flyToLayer(layerId) || false,
    setSceneMode: changeMode,
    getSceneMode: () => (viewer && !viewer.isDestroyed() ? getSceneMode(viewer) : '3D'),
    isReady: () => ready.value
  }
  controllerRef = controller
  registerSceneController(optionRef, controller)

  setupMorphEvents()
  const initialCamera = readCamera()
  applyCamera(viewer, initialCamera)
  const initialMode = normalizeSceneMode(optionRef.sceneMode)
  currentMode.value = initialMode
  if (initialMode !== '3D') {
    morphing.value = true
    const onInitialMorph = () => {
      if (!viewer || viewer.isDestroyed()) return
      viewer.scene.morphComplete.removeEventListener(onInitialMorph)
      applyCamera(viewer, initialCamera)
    }
    viewer.scene.morphComplete.addEventListener(onInitialMorph)
    setSceneMode(viewer, initialMode, 0)
  }

  await nextTick()
  if (!viewer.isDestroyed()) viewer.resize()
  syncer.sync(optionRef)
  ready.value = true

  resizeObserver = new ResizeObserver(() => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      if (viewer && !viewer.isDestroyed()) viewer.resize()
    })
  })
  if (rootRef.value) resizeObserver.observe(rootRef.value)

  window.addEventListener('keydown', onWindowKeydown)
  watch(() => props.chartConfig.option, scheduleSync, { deep: true })
})

onBeforeUnmount(() => {
  disposed = true
  if (syncTimer) clearTimeout(syncTimer)
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onWindowKeydown)
  if (shapeModal) shapeModal.style.pointerEvents = ''
  syncer?.dispose()
  if (controllerRef) unregisterSceneController(optionRef, controllerRef)
  controllerRef = null
  try {
    if (viewer && !viewer.isDestroyed()) viewer.destroy()
  } catch {
    // 忽略重复销毁
  }
  viewer = null
  syncer = null
})
</script>

<style lang="scss" scoped src="@/components/Scene3D/scene3d.scss"></style>
