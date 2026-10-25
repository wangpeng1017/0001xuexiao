import { GeoJsonDataSource, Color, ColorMaterialProperty, ConstantProperty } from 'cesium'
import { SceneLayer } from '../types'
import { FactoryContext, VectorRuntime, requireUrl } from './base'

const colorOf = (css: string | undefined, fallback: string, opacity: number) => {
  const color = Color.fromCssColorString(css || fallback) || Color.fromCssColorString(fallback)!
  return color.withAlpha(Math.min(Math.max(Number(opacity) || 0, 0), 1))
}

export const applyVectorStyle = (runtime: VectorRuntime, layer: SceneLayer, setVisible: boolean) => {
  const { dataSource } = runtime
  dataSource.show = setVisible && layer.visible
  const opacity = Math.min(Math.max(Number(layer.opacity) || 0, 0), 1)
  const fill = colorOf(layer.style.fill, '#51d6a9', opacity)
  const stroke = colorOf(layer.style.stroke, '#0b3f56', opacity)
  const point = colorOf(layer.style.pointColor, '#ffd166', opacity)
  const width = Math.max(Number(layer.style.strokeWidth) || 2, 1)

  for (const entity of dataSource.entities.values) {
    const polygon = entity.polygon
    if (polygon) {
      polygon.material = new ColorMaterialProperty(fill)
      polygon.outline = new ConstantProperty(true)
      polygon.outlineColor = new ConstantProperty(stroke)
    }
    const polyline = entity.polyline
    if (polyline) {
      polyline.material = new ColorMaterialProperty(stroke)
      polyline.width = new ConstantProperty(width)
    }
    if (entity.billboard) {
      entity.billboard.color = new ConstantProperty(point)
      entity.billboard.scale = new ConstantProperty(1)
    }
    if (entity.point) {
      entity.point.color = new ConstantProperty(point)
      entity.point.pixelSize = new ConstantProperty(9)
      entity.point.outlineColor = new ConstantProperty(stroke)
      entity.point.outlineWidth = new ConstantProperty(2)
    }
    if (entity.label) {
      entity.label.fillColor = new ConstantProperty(point)
    }
  }
}

export const createVectorRuntime = async (
  ctx: FactoryContext,
  layer: SceneLayer,
  createKey: string
): Promise<VectorRuntime> => {
  const dataSource = await GeoJsonDataSource.load(requireUrl(layer.source.url), {
    clampToGround: true,
    markerSize: 34
  })
  if (ctx.viewer.isDestroyed()) {
    dataSource.destroy()
    throw new Error('场景已销毁')
  }
  await ctx.viewer.dataSources.add(dataSource)
  const runtime: VectorRuntime = { kind: 'vector', layerId: layer.id, createKey, dataSource }
  applyVectorStyle(runtime, layer, true)
  return runtime
}

export const destroyVectorRuntime = (ctx: FactoryContext, runtime: VectorRuntime) => {
  if (!ctx.viewer.isDestroyed()) ctx.viewer.dataSources.remove(runtime.dataSource, true)
}
