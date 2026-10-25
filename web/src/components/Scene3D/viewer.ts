import './cesiumEnv'
import {
  Color,
  Ion,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  Viewer,
  buildModuleUrl
} from 'cesium'

// 私有化部署不访问 Cesium Ion
Ion.defaultAccessToken = ''

let naturalEarthPromise: Promise<TileMapServiceImageryProvider> | null = null

export const createSceneViewer = (container: HTMLElement) => {
  const creditContainer = document.createElement('div')
  creditContainer.style.display = 'none'

  const viewer = new Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    timeline: false,
    animation: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    scene3DOnly: false,
    shouldAnimate: false,
    requestRenderMode: false,
    creditContainer
  })

  viewer.scene.globe.baseColor = Color.fromCssColorString('#081522') || Color.BLACK
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 5
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  ;(viewer.scene.canvas as HTMLCanvasElement).style.outline = 'none'

  return viewer
}

// Cesium 自带的离线底图，不依赖 Ion 和任何外网
export const addNaturalEarthBaseLayer = async (viewer: Viewer) => {
  if (!naturalEarthPromise) {
    naturalEarthPromise = TileMapServiceImageryProvider.fromUrl(
      buildModuleUrl('Assets/Textures/NaturalEarthII')
    ).catch(error => {
      naturalEarthPromise = null
      throw error
    })
  }
  const provider = await naturalEarthPromise
  if (viewer.isDestroyed()) return null
  return viewer.imageryLayers.addImageryProvider(provider, 0)
}
