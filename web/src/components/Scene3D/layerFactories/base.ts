import type {
  Cesium3DTileset,
  CustomDataSource,
  GeoJsonDataSource,
  ImageryLayer,
  ImageryProvider,
  Model,
  Viewer
} from 'cesium'
import type { SceneLayer } from '../types'

export interface FactoryContext {
  viewer: Viewer
}

export interface RuntimeBase {
  layerId: string
  createKey: string
}

export interface ImageryRuntime extends RuntimeBase {
  kind: 'imagery'
  imageryLayer: ImageryLayer
  provider: ImageryProvider
}

export interface VectorRuntime extends RuntimeBase {
  kind: 'vector'
  dataSource: GeoJsonDataSource
}

export interface ModelRuntime extends RuntimeBase {
  kind: 'model'
  primitive: Model | Cesium3DTileset
  model?: Model
  tileset?: Cesium3DTileset
  tilesetCenter?: import('cesium').Cartesian3
}

export interface PanoramaRuntime extends RuntimeBase {
  kind: 'panorama'
  dataSource: CustomDataSource
}

export type LayerRuntime = ImageryRuntime | VectorRuntime | ModelRuntime | PanoramaRuntime

export const isImageryRuntime = (runtime: LayerRuntime): runtime is ImageryRuntime =>
  runtime.kind === 'imagery'
export const isVectorRuntime = (runtime: LayerRuntime): runtime is VectorRuntime =>
  runtime.kind === 'vector'
export const isModelRuntime = (runtime: LayerRuntime): runtime is ModelRuntime =>
  runtime.kind === 'model'
export const isPanoramaRuntime = (runtime: LayerRuntime): runtime is PanoramaRuntime =>
  runtime.kind === 'panorama'

export const requireUrl = (url?: string) => {
  const value = (url || '').trim()
  if (!value) throw new Error('图层地址为空')
  return value
}

// XYZ 地址允许省略 {z}/{x}/{y} 模板，自动补全
export const normalizeXyzUrl = (url?: string) => {
  const value = requireUrl(url)
  if (value.includes('{z}')) return value
  const clean = value.replace(/\/+$/, '')
  if (/\.(png|jpg|jpeg|webp)(\?.*)?$/i.test(clean)) return clean
  return `${clean}/{z}/{x}/{y}.png`
}

export const applyImageryState = (
  runtime: ImageryRuntime,
  layer: SceneLayer,
  setVisible: boolean
) => {
  runtime.imageryLayer.show = setVisible && layer.visible
  const opacity = Math.min(Math.max(Number(layer.opacity) || 0, 0), 1)
  runtime.imageryLayer.alpha = opacity
}

export const removeImageryRuntime = (ctx: FactoryContext, runtime: ImageryRuntime) => {
  if (!ctx.viewer.isDestroyed()) ctx.viewer.imageryLayers.remove(runtime.imageryLayer, true)
}
