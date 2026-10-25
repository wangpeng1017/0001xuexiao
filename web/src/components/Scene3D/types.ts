// 三维场景 option 契约（docs/API-M2-M4.md 第 8 节）
export type SceneMode = '3D' | '2.5D' | '2D'

export type SceneLayerType = 'raster' | 'vector' | 'model' | 'service' | 'panorama'

export type ServiceProtocol = 'arcgis' | 'wms' | 'wmts' | 'xyz'

export type SourceFrom = 'datafile' | 'material' | 'url'

export interface SceneCamera {
  lon: number
  lat: number
  height: number
  heading: number
  pitch: number
  roll: number
}

export interface LayerPosition {
  lon: number
  lat: number
  height: number
}

export interface LayerRotation {
  heading: number
  pitch: number
  roll: number
}

export interface PanoramaPoint {
  id: string
  name: string
  lon: number
  lat: number
  imageUrl: string
}

export interface LayerSource {
  from?: SourceFrom
  refId?: string
  url?: string
  format?: string
  position?: LayerPosition
  rotation?: LayerRotation
  scale?: number
  product?: string
  protocol?: ServiceProtocol
  layers?: string
  style?: string
  tileMatrixSet?: string
  points?: PanoramaPoint[]
}

export interface LayerStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  pointColor?: string
  pointSize?: number
  colorBy?: 'rgb' | 'height'
}

export interface SceneLayer {
  id: string
  name: string
  type: SceneLayerType
  source: LayerSource
  visible: boolean
  opacity: number
  style: LayerStyle
}

export interface SceneLayerSet {
  id: string
  name: string
  visible: boolean
  layers: SceneLayer[]
}

export interface Scene3DOption {
  sceneMode: SceneMode
  camera: SceneCamera
  baseLayer: string
  layerSets: SceneLayerSet[]
}

export interface LayerDraft {
  type: SceneLayerType
  name: string
  source: LayerSource
  style: LayerStyle
}

export interface GisProtocolMeta {
  value: ServiceProtocol
  label: string
  urlPlaceholder: string
  defaultFormat?: string
  defaultTileMatrixSet?: string
}

export interface GisProductMeta {
  value: string
  label: string
  protocols: GisProtocolMeta[]
}

export interface DataFileItem {
  id: string
  name: string
  kind: string
  status: string
  outputUrl: string
  createUserName?: string
}

export interface MaterialItem {
  id: string
  name: string
  category: string
  url: string
  thumb?: string
}

// 产品配置表：新增产品只改这里，底层只实现 4 种 Provider
export const GIS_PRODUCTS: GisProductMeta[] = [
  {
    value: 'arcgis',
    label: 'ArcGIS Server / ArcGIS Enterprise',
    protocols: [
      {
        value: 'arcgis',
        label: 'ArcGIS MapServer（REST）',
        urlPlaceholder: 'http://<服务器>/arcgis/rest/services/<服务名>/MapServer'
      },
      {
        value: 'wms',
        label: 'WMS',
        urlPlaceholder: 'http://<服务器>/arcgis/services/<服务名>/MapServer/WMSServer',
        defaultFormat: 'image/png'
      },
      {
        value: 'wmts',
        label: 'WMTS',
        urlPlaceholder: 'http://<服务器>/arcgis/rest/services/<服务名>/MapServer/WMTS',
        defaultFormat: 'image/png',
        defaultTileMatrixSet: 'default028mm'
      }
    ]
  },
  {
    value: 'geoserver',
    label: 'GeoServer',
    protocols: [
      {
        value: 'wms',
        label: 'WMS',
        urlPlaceholder: 'http://<服务器>/geoserver/<工作区>/wms',
        defaultFormat: 'image/png'
      },
      {
        value: 'wmts',
        label: 'WMTS',
        urlPlaceholder: 'http://<服务器>/geoserver/gwc/service/wmts',
        defaultFormat: 'image/png',
        defaultTileMatrixSet: 'EPSG:4326'
      }
    ]
  },
  {
    value: 'supermap',
    label: 'SuperMap iServer（超图）',
    protocols: [
      {
        value: 'wms',
        label: 'WMS',
        urlPlaceholder: 'http://<服务器>:8090/iserver/services/<服务名>/wms130',
        defaultFormat: 'image/png'
      },
      {
        value: 'wmts',
        label: 'WMTS',
        urlPlaceholder: 'http://<服务器>:8090/iserver/services/<服务名>/wmts',
        defaultFormat: 'image/png',
        defaultTileMatrixSet: 'ChinaPublicServices'
      }
    ]
  },
  {
    value: 'mapgis',
    label: 'MapGIS IGServer（中地数码）',
    protocols: [
      {
        value: 'wms',
        label: 'WMS',
        urlPlaceholder: 'http://<服务器>/igs/rest/ogc/<服务名>/WMS',
        defaultFormat: 'image/png'
      },
      {
        value: 'wmts',
        label: 'WMTS',
        urlPlaceholder: 'http://<服务器>/igs/rest/ogc/<服务名>/WMTS',
        defaultFormat: 'image/png',
        defaultTileMatrixSet: 'EPSG:4326'
      }
    ]
  },
  {
    value: 'tianditu',
    label: '天地图（内网离线部署版）',
    protocols: [
      {
        value: 'wmts',
        label: 'WMTS',
        urlPlaceholder: 'http://<服务器>/tianditu/wmts',
        defaultFormat: 'image/png',
        defaultTileMatrixSet: 'EPSG:4326'
      }
    ]
  },
  {
    value: 'ogc',
    label: '通用 OGC 服务',
    protocols: [
      {
        value: 'wms',
        label: 'WMS',
        urlPlaceholder: 'http://<服务器>/geoserver/wms',
        defaultFormat: 'image/png'
      },
      {
        value: 'wmts',
        label: 'WMTS',
        urlPlaceholder: 'http://<服务器>/wmts',
        defaultFormat: 'image/png',
        defaultTileMatrixSet: 'EPSG:4326'
      }
    ]
  },
  {
    value: 'tiles',
    label: '通用瓦片服务',
    protocols: [
      {
        value: 'xyz',
        label: 'XYZ',
        urlPlaceholder: 'http://<服务器>/tiles/{z}/{x}/{y}.png'
      }
    ]
  }
]

export const findGisProduct = (value?: string) =>
  GIS_PRODUCTS.find(item => item.value === value) || GIS_PRODUCTS[0]

export const normalizeSceneMode = (mode?: string): SceneMode =>
  mode === '2D' || mode === '2.5D' ? mode : '3D'
