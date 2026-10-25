// 必须在任何 Cesium 资源 URL 解析之前设置
const baseUrl = '/static/cesium/'
if (typeof window !== 'undefined') {
  ;(window as any).CESIUM_BASE_URL = baseUrl
}

export const CESIUM_STATIC_BASE = baseUrl
