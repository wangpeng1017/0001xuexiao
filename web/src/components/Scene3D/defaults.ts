import { getUUID } from '@/utils'
import {
  LayerStyle,
  Scene3DOption,
  SceneLayer,
  SceneLayerSet,
  SceneLayerType,
  SceneMode
} from './types'

export const DEFAULT_CAMERA = {
  lon: 116.39,
  lat: 39.9,
  height: 15000000,
  heading: 0,
  pitch: -90,
  roll: 0
}

export const createLayerSet = (name = '新建图层集'): SceneLayerSet => ({
  id: getUUID(),
  name,
  visible: true,
  layers: []
})

export const createDefaultSceneOption = (): Scene3DOption => ({
  sceneMode: '3D',
  camera: { ...DEFAULT_CAMERA },
  baseLayer: 'naturalEarth',
  layerSets: [createLayerSet('默认图层集')]
})

export const DEFAULT_LAYER_STYLE: LayerStyle = {
  fill: '#51d6a9',
  stroke: '#0b3f56',
  strokeWidth: 3,
  pointColor: '#ffd166',
  pointSize: 2,
  colorBy: 'rgb'
}

export const createEmptyLayer = (type: SceneLayerType, name: string): SceneLayer => ({
  id: getUUID(),
  name,
  type,
  source: {},
  visible: true,
  opacity: 1,
  style: { ...DEFAULT_LAYER_STYLE }
})

export const createDefaultLayerSets = (): SceneLayerSet[] => [createLayerSet('默认图层集')]

export const nextLayerSetName = (sets: SceneLayerSet[]) => {
  let index = sets.length + 1
  const used = new Set(sets.map(item => item.name))
  while (used.has(`图层集 ${index}`)) index++
  return `图层集 ${index}`
}

export const nextLayerName = (sets: SceneLayerSet[], typeName: string) => {
  const used = new Set(sets.flatMap(set => set.layers.map(layer => layer.name)))
  let index = 1
  while (used.has(`${typeName} ${index}`)) index++
  return `${typeName} ${index}`
}

export const LAYER_TYPE_NAMES: Record<SceneLayerType, string> = {
  raster: '栅格图层',
  vector: '矢量图层',
  model: '三维模型',
  service: '地图服务',
  panorama: '360 街景'
}

export const SCENE_MODE_LABELS: Record<SceneMode, string> = {
  '3D': '三维',
  '2.5D': '2.5D',
  '2D': '二维'
}

export const isValidLonLat = (lon: number, lat: number) =>
  Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
