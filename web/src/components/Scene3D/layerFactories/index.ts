import { SceneLayer } from '../types'
import { FactoryContext, LayerRuntime, removeImageryRuntime } from './base'
import { createRasterRuntime, updateRasterRuntime } from './raster'
import { createServiceRuntime, updateServiceRuntime } from './service'
import { createVectorRuntime, destroyVectorRuntime, applyVectorStyle } from './vector'
import { createModelRuntime, destroyModelRuntime, updateModelRuntime } from './model'
import {
  applyPanoramaState,
  createPanoramaRuntime,
  destroyPanoramaRuntime
} from './panorama'

export const buildLayerCreateKey = (layer: SceneLayer) => {
  const source = layer.source
  switch (layer.type) {
    case 'raster':
      return ['raster', source.from, source.refId, source.url].join('|')
    case 'service':
      return [
        'service',
        source.product,
        source.protocol,
        source.url,
        source.layers,
        source.style,
        source.format,
        source.tileMatrixSet
      ].join('|')
    case 'vector':
      return ['vector', source.url, layer.style.extrude ? 'extrude' : 'ground'].join('|')
    case 'model':
      return ['model', source.format, source.url].join('|')
    case 'panorama':
      return ['panorama', JSON.stringify(source.points || [])].join('|')
    default:
      return layer.type
  }
}

export const createLayerRuntime = async (
  ctx: FactoryContext,
  layer: SceneLayer,
  createKey: string
): Promise<LayerRuntime> => {
  switch (layer.type) {
    case 'raster':
      return createRasterRuntime(ctx, layer, createKey)
    case 'service':
      return createServiceRuntime(ctx, layer, createKey)
    case 'vector':
      return createVectorRuntime(ctx, layer, createKey)
    case 'model':
      return createModelRuntime(ctx, layer, createKey)
    case 'panorama':
      return createPanoramaRuntime(ctx, layer, createKey)
    default:
      throw new Error('不支持的图层类型')
  }
}

export const updateLayerRuntime = (
  runtime: LayerRuntime,
  layer: SceneLayer,
  setVisible: boolean
) => {
  if (runtime.kind === 'imagery') {
    if (layer.type === 'service') updateServiceRuntime(runtime, layer, setVisible)
    else updateRasterRuntime(runtime, layer, setVisible)
    return
  }
  if (runtime.kind === 'vector') {
    applyVectorStyle(runtime, layer, setVisible)
    return
  }
  if (runtime.kind === 'model') {
    updateModelRuntime(runtime, layer, setVisible)
    return
  }
  if (runtime.kind === 'panorama') {
    applyPanoramaState(runtime, layer, setVisible)
  }
}

export const destroyLayerRuntime = (ctx: FactoryContext, runtime: LayerRuntime) => {
  if (runtime.kind === 'imagery') {
    removeImageryRuntime(ctx, runtime)
    return
  }
  if (runtime.kind === 'vector') {
    destroyVectorRuntime(ctx, runtime)
    return
  }
  if (runtime.kind === 'model') {
    destroyModelRuntime(ctx, runtime)
    return
  }
  if (runtime.kind === 'panorama') {
    destroyPanoramaRuntime(ctx, runtime)
  }
}

export const formatLayerError = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}
