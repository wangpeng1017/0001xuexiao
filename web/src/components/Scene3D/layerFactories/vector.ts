import {
  Entity,
  GeoJsonDataSource,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  JulianDate,
  PinBuilder
} from 'cesium'
import { SceneLayer } from '../types'
import { FactoryContext, VectorRuntime, requireUrl } from './base'

const DEFAULT_EXTRUDE_HEIGHT = 12
const PIN_SIZE = 34
const pinBuilder = new PinBuilder()

const colorOf = (css: string | undefined, fallback: string, opacity: number) => {
  const color = Color.fromCssColorString(css || fallback) || Color.fromCssColorString(fallback)!
  return color.withAlpha(Math.min(Math.max(Number(opacity) || 0, 0), 1))
}

const propertyOf = (entity: Entity, field: string | undefined) => {
  if (!field || !entity.properties) return undefined
  const value = entity.properties[field]?.getValue(JulianDate.now())
  return value === undefined || value === null ? undefined : String(value)
}

export const applyVectorStyle = (runtime: VectorRuntime, layer: SceneLayer, setVisible: boolean) => {
  const { dataSource } = runtime
  dataSource.show = setVisible && layer.visible
  const { style } = layer
  const opacity = Math.min(Math.max(Number(layer.opacity) || 0, 0), 1)
  const stroke = colorOf(style.stroke, '#0b3f56', opacity)
  const width = Math.max(Number(style.strokeWidth) || 2, 1)
  const colorKeyOf = (entity: Entity) => propertyOf(entity, style.colorField)
  const colorMap = style.colorMap || {}

  for (const entity of dataSource.entities.values) {
    const mapped = colorMap[colorKeyOf(entity) ?? '']
    const fill = colorOf(mapped || style.fill, '#51d6a9', opacity)
    const point = colorOf(mapped || style.pointColor, '#ffd166', opacity)
    const polygon = entity.polygon
    if (polygon) {
      polygon.material = new ColorMaterialProperty(fill)
      polygon.outline = new ConstantProperty(true)
      polygon.outlineColor = new ConstantProperty(stroke)
      if (style.extrude) {
        const height = Number(entity.properties?.height?.getValue(JulianDate.now()))
        polygon.height = new ConstantProperty(0)
        const scale = Number(style.extrudeScale) > 0 ? Number(style.extrudeScale) : 1
        polygon.extrudedHeight = new ConstantProperty(
          (height > 0 ? height : DEFAULT_EXTRUDE_HEIGHT) * scale
        )
      }
    }
    const polyline = entity.polyline
    if (polyline) {
      polyline.material = new ColorMaterialProperty(stroke)
      polyline.width = new ConstantProperty(width)
    }
    if (entity.billboard) {
      // 直接按颜色生成图钉，避免对默认图钉做乘色导致发暗
      entity.billboard.image = new ConstantProperty(pinBuilder.fromColor(point, PIN_SIZE))
      entity.billboard.color = new ConstantProperty(Color.WHITE)
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
    clampToGround: !layer.style.extrude,
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
