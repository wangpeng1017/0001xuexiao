import { getUUID } from '@/utils'
import { DEFAULT_LAYER_STYLE } from '../defaults'
import { LayerDraft, LayerSource, LayerStyle, SceneLayer, SceneLayerType } from '../types'

export const createDraft = (type: SceneLayerType, name: string): LayerDraft => {
  const source: LayerSource = {}
  if (type === 'raster' || type === 'vector') {
    source.from = 'url'
    source.url = ''
  } else if (type === 'model') {
    source.from = 'url'
    source.url = ''
    source.format = 'gltf'
    source.position = { lon: 116.39, lat: 39.9, height: 0 }
    source.rotation = { heading: 0, pitch: 0, roll: 0 }
    source.scale = 1
  } else if (type === 'service') {
    source.product = 'geoserver'
    source.protocol = 'wms'
    source.url = ''
    source.layers = ''
    source.style = ''
    source.format = 'image/png'
    source.tileMatrixSet = 'EPSG:4326'
  } else {
    source.points = []
  }
  return {
    type,
    name,
    source,
    style: { ...DEFAULT_LAYER_STYLE } as LayerStyle
  }
}

export const draftToLayer = (draft: LayerDraft): SceneLayer => ({
  id: getUUID(),
  name: draft.name,
  type: draft.type,
  source: JSON.parse(JSON.stringify(draft.source)) as LayerSource,
  visible: true,
  opacity: 1,
  style: JSON.parse(JSON.stringify(draft.style)) as LayerStyle
})
