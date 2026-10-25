import {
  Cartesian3,
  Cartographic,
  HeadingPitchRoll,
  Math as CesiumMath,
  Matrix4,
  Quaternion,
  Rectangle,
  SceneMode,
  Transforms,
  Viewer
} from 'cesium'
import { LayerPosition, LayerRotation, SceneCamera, SceneMode as SceneModeText } from './types'

const normalizeDegrees = (value: number) => {
  const result = value % 360
  return result < 0 ? result + 360 : result
}

export const cameraStateToView = (camera: SceneCamera) => ({
  destination: Cartesian3.fromDegrees(
    Number(camera.lon) || 0,
    Number(camera.lat) || 0,
    Math.max(Number(camera.height) || 10, 10)
  ),
  orientation: {
    heading: CesiumMath.toRadians(Number(camera.heading) || 0),
    pitch: CesiumMath.toRadians(Number(camera.pitch) || -90),
    roll: CesiumMath.toRadians(Number(camera.roll) || 0)
  }
})

export const applyCamera = (viewer: Viewer, camera: SceneCamera, duration = 0) => {
  if (viewer.isDestroyed()) return
  const view = cameraStateToView(camera)
  if (duration > 0) {
    viewer.camera.flyTo({ ...view, duration })
  } else {
    viewer.camera.setView(view)
  }
}

export const captureCamera = (viewer: Viewer): SceneCamera | null => {
  if (viewer.isDestroyed()) return null
  const cartographic = viewer.camera.positionCartographic
  if (!cartographic) return null
  return {
    lon: CesiumMath.toDegrees(cartographic.longitude),
    lat: CesiumMath.toDegrees(cartographic.latitude),
    height: Math.max(cartographic.height, 10),
    heading: normalizeDegrees(CesiumMath.toDegrees(viewer.camera.heading)),
    pitch: CesiumMath.toDegrees(viewer.camera.pitch),
    roll: CesiumMath.toDegrees(viewer.camera.roll)
  }
}

const sceneModeToCesium = (mode: SceneModeText) => {
  if (mode === '2D') return SceneMode.SCENE2D
  if (mode === '2.5D') return SceneMode.COLUMBUS_VIEW
  return SceneMode.SCENE3D
}

export const getSceneMode = (viewer: Viewer): SceneModeText => {
  if (viewer.isDestroyed()) return '3D'
  if (viewer.scene.mode === SceneMode.SCENE2D) return '2D'
  if (viewer.scene.mode === SceneMode.COLUMBUS_VIEW) return '2.5D'
  return '3D'
}

export const setSceneMode = (viewer: Viewer, mode: SceneModeText, duration = 1.2) => {
  if (viewer.isDestroyed() || viewer.scene.mode === sceneModeToCesium(mode)) return
  if (mode === '2D') viewer.scene.morphTo2D(duration)
  else if (mode === '2.5D') viewer.scene.morphToColumbusView(duration)
  else viewer.scene.morphTo3D(duration)
}

export const buildModelMatrix = (
  position: LayerPosition,
  rotation: LayerRotation,
  scale: number
) => {
  const translation = Cartesian3.fromDegrees(
    Number(position.lon) || 0,
    Number(position.lat) || 0,
    Number(position.height) || 0
  )
  const headingPitchRoll = new HeadingPitchRoll(
    CesiumMath.toRadians(Number(rotation.heading) || 0),
    CesiumMath.toRadians(Number(rotation.pitch) || 0),
    CesiumMath.toRadians(Number(rotation.roll) || 0)
  )
  const quaternion = Quaternion.fromHeadingPitchRoll(headingPitchRoll)
  const safeScale = Math.max(Number(scale) || 1, 0.0001)
  return Matrix4.fromTranslationQuaternionRotationScale(
    translation,
    quaternion,
    new Cartesian3(safeScale, safeScale, safeScale)
  )
}

// 3D Tiles 整体平移：经度/纬度/高度偏移按原点处的东-北-天方向换算成米
export const buildTilesetOffsetMatrix = (center: Cartesian3, offset: LayerPosition) => {
  const origin = Cartographic.fromCartesian(center)
  const lat = CesiumMath.toDegrees(origin.latitude)
  const metersPerDegree = (Math.PI / 180) * 6378137
  const east = (Number(offset.lon) || 0) * metersPerDegree * Math.cos(CesiumMath.toRadians(lat))
  const north = (Number(offset.lat) || 0) * metersPerDegree
  const up = Number(offset.height) || 0
  const enu = Transforms.eastNorthUpToFixedFrame(center)
  const target = Matrix4.multiplyByPoint(enu, new Cartesian3(east, north, up), new Cartesian3())
  const delta = Cartesian3.subtract(target, center, new Cartesian3())
  return Matrix4.fromTranslation(delta)
}

export const flyToPoint = (viewer: Viewer, lon: number, lat: number, height = 1200, pitch = -35) => {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, height),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(pitch),
      roll: 0
    },
    duration: 1.2
  })
}

export const flyToRectangle = (viewer: Viewer, rectangle: Rectangle) => {
  viewer.camera.flyTo({ destination: rectangle, duration: 1.2 })
}

export const pickGlobePosition = (
  viewer: Viewer,
  screenPosition: { x: number; y: number }
): LayerPosition | null => {
  if (viewer.isDestroyed()) return null
  let cartesian: Cartesian3 | undefined
  try {
    cartesian = viewer.scene.pickPosition(screenPosition)
  } catch {
    cartesian = undefined
  }
  if (!cartesian) {
    const ray = viewer.camera.getPickRay(screenPosition)
    if (ray) cartesian = viewer.scene.globe.pick(ray, viewer.scene) || undefined
  }
  if (!cartesian) {
    cartesian = viewer.camera.pickEllipsoid(screenPosition, viewer.scene.globe.ellipsoid)
  }
  if (!cartesian) return null
  const cartographic = Cartographic.fromCartesian(cartesian)
  return {
    lon: CesiumMath.toDegrees(cartographic.longitude),
    lat: CesiumMath.toDegrees(cartographic.latitude),
    height: Math.max(cartographic.height, 0)
  }
}
