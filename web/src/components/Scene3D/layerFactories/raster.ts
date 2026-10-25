import { UrlTemplateImageryProvider } from 'cesium'
import { SceneLayer } from '../types'
import {
  FactoryContext,
  ImageryRuntime,
  applyImageryState,
  normalizeXyzUrl
} from './base'

export const createRasterRuntime = (
  ctx: FactoryContext,
  layer: SceneLayer,
  createKey: string
): ImageryRuntime => {
  const provider = new UrlTemplateImageryProvider({
    url: normalizeXyzUrl(layer.source.url)
  })
  const imageryLayer = ctx.viewer.imageryLayers.addImageryProvider(provider)
  return { kind: 'imagery', layerId: layer.id, createKey, imageryLayer, provider }
}

export const updateRasterRuntime = (
  runtime: ImageryRuntime,
  layer: SceneLayer,
  setVisible: boolean
) => {
  applyImageryState(runtime, layer, setVisible)
}

export const destroyRasterRuntime = (ctx: FactoryContext, runtime: ImageryRuntime) => {
  if (!ctx.viewer.isDestroyed()) ctx.viewer.imageryLayers.remove(runtime.imageryLayer, true)
}
