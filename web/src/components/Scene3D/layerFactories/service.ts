import {
  ArcGisMapServerImageryProvider,
  ImageryProvider,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider
} from 'cesium'
import { SceneLayer } from '../types'
import {
  FactoryContext,
  ImageryRuntime,
  applyImageryState,
  normalizeXyzUrl,
  requireUrl
} from './base'

const createProvider = async (layer: SceneLayer): Promise<ImageryProvider> => {
  const source = layer.source
  const url = requireUrl(source.url)
  switch (source.protocol) {
    case 'arcgis':
      return ArcGisMapServerImageryProvider.fromUrl(url, { enablePickFeatures: false })
    case 'wms':
      return new WebMapServiceImageryProvider({
        url,
        layers: source.layers || '',
        parameters: {
          transparent: true,
          format: source.format || 'image/png',
          ...(source.style ? { styles: source.style } : {})
        },
        enablePickFeatures: false
      })
    case 'wmts':
      return new WebMapTileServiceImageryProvider({
        url,
        layer: source.layers || '',
        style: source.style || 'default',
        format: source.format || 'image/png',
        tileMatrixSetID: source.tileMatrixSet || 'EPSG:4326',
        enablePickFeatures: false
      })
    case 'xyz':
    default:
      return new UrlTemplateImageryProvider({ url: normalizeXyzUrl(source.url) })
  }
}

export const createServiceRuntime = async (
  ctx: FactoryContext,
  layer: SceneLayer,
  createKey: string
): Promise<ImageryRuntime> => {
  const provider = await createProvider(layer)
  if (ctx.viewer.isDestroyed()) throw new Error('场景已销毁')
  const imageryLayer = ctx.viewer.imageryLayers.addImageryProvider(provider)
  const runtime: ImageryRuntime = {
    kind: 'imagery',
    layerId: layer.id,
    createKey,
    imageryLayer,
    provider
  }
  applyImageryState(runtime, layer, true)
  return runtime
}

export const updateServiceRuntime = (
  runtime: ImageryRuntime,
  layer: SceneLayer,
  setVisible: boolean
) => {
  applyImageryState(runtime, layer, setVisible)
}

export const destroyServiceRuntime = (ctx: FactoryContext, runtime: ImageryRuntime) => {
  if (!ctx.viewer.isDestroyed()) ctx.viewer.imageryLayers.remove(runtime.imageryLayer, true)
}
