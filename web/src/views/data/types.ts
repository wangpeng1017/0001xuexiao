export type DatasetType = 'http' | 'mysql'

export interface HttpDatasetConfig {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body: string
  dataPath: string
}

export interface MysqlDatasetConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  sql: string
}

export type DatasetConfig = HttpDatasetConfig | MysqlDatasetConfig

export interface DatasetItem {
  id: string
  name: string
  type: DatasetType
  config: DatasetConfig
  createUserId: string
  createUserName: string
  createTime: string
  updateTime: string
}

export interface DatasetPreviewResult {
  data: unknown
  truncated: boolean
}

export interface DataFileItem {
  id: string
  name: string
  originFormat: string
  kind: string
  status: 'pending' | 'converting' | 'success' | 'failed'
  progress: number
  errorMsg: string
  srs: string
  outputUrl: string
  createTime: string
  createUserName: string
}

export interface FormatItem {
  code: string
  name: string
}

export interface FormatGroup {
  name: string
  items: FormatItem[]
}

export interface FormatsResult {
  total: number
  groups: FormatGroup[]
}

export interface LocalAnchor {
  lon: number
  lat: number
  height: number
}

export const DEFAULT_LOCAL_ANCHOR: LocalAnchor = { lon: 116.31, lat: 40, height: 0 }

export function parseLocalAnchor(srs: string): LocalAnchor | null {
  const raw = srs.trim()
  if (raw.toUpperCase() === 'LOCAL') return { ...DEFAULT_LOCAL_ANCHOR }
  const match = /^LOCAL:([^,]+),([^,]+),([^,]+)$/i.exec(raw)
  if (!match) return null
  const [lon, lat, height] = match.slice(1).map(Number)
  if (![lon, lat, height].every((value) => Number.isFinite(value))) return null
  return { lon, lat, height }
}

export function formatSrsLabel(srs: string): string {
  if (!srs) return '-'
  const anchor = parseLocalAnchor(srs)
  if (!anchor) return srs
  return `局部坐标（${anchor.lon}, ${anchor.lat}, ${anchor.height}）`
}

export const kindLabelMap: Record<string, string> = {
  vector: '矢量',
  raster: '栅格',
  pointcloud: '点云',
  tiles3d: '3D Tiles'
}

export const statusLabelMap: Record<string, string> = {
  pending: '排队中',
  converting: '转换中',
  success: '成功',
  failed: '失败'
}
