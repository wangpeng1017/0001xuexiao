import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  CustomDataSource,
  Entity,
  HeightReference,
  LabelStyle,
  VerticalOrigin
} from 'cesium'
import { PanoramaPoint, SceneLayer } from '../types'
import { FactoryContext, PanoramaRuntime } from './base'

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
<path d="M18 1C8.6 1 1 8.6 1 18c0 12.5 17 29 17 29s17-16.5 17-29C35 8.6 27.4 1 18 1z" fill="#51d6a9" stroke="#ffffff" stroke-width="2"/>
<circle cx="18" cy="18" r="7" fill="#07131f"/>
<circle cx="18" cy="18" r="3" fill="#ffffff"/>
</svg>`

const pinImage = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PIN_SVG)}`

const pointColor = (layer: SceneLayer) => {
  const opacity = Math.min(Math.max(Number(layer.opacity) || 0, 0), 1)
  return (Color.fromCssColorString(layer.style.pointColor || '#51d6a9') || Color.WHITE).withAlpha(opacity)
}

const attachPoint = (entity: Entity, point: PanoramaPoint) => {
  ;(entity as unknown as Record<string, unknown>).__panoramaPoint = point
}

export const getPanoramaPointFromEntity = (entity: unknown): PanoramaPoint | null => {
  if (!entity || typeof entity !== 'object') return null
  const point = (entity as Record<string, unknown>).__panoramaPoint
  return point ? (point as PanoramaPoint) : null
}

const createEntities = (dataSource: CustomDataSource, layer: SceneLayer) => {
  const points = layer.source.points || []
  for (const point of points) {
    const entity = new Entity({
      id: `${layer.id}-${point.id}`,
      name: point.name,
      position: Cartesian3.fromDegrees(Number(point.lon), Number(point.lat), 0),
      billboard: {
        image: pinImage,
        width: 30,
        height: 40,
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: HeightReference.NONE
      },
      label: {
        text: point.name,
        font: '13px sans-serif',
        style: LabelStyle.FILL_AND_OUTLINE,
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString('#07131f') || Color.BLACK,
        outlineWidth: 3,
        verticalOrigin: VerticalOrigin.TOP,
        pixelOffset: new Cartesian2(0, 8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: (Color.fromCssColorString('#07131f') || Color.BLACK).withAlpha(0.6),
        backgroundPadding: new Cartesian2(6, 3)
      }
    })
    attachPoint(entity, point)
    dataSource.entities.add(entity)
  }
}

export const applyPanoramaState = (runtime: PanoramaRuntime, layer: SceneLayer, setVisible: boolean) => {
  runtime.dataSource.show = setVisible && layer.visible
  const tint = pointColor(layer)
  for (const entity of runtime.dataSource.entities.values) {
    if (entity.billboard) entity.billboard.color = new ConstantProperty(tint)
    if (entity.label) entity.label.fillColor = new ConstantProperty(tint)
  }
}

export const createPanoramaRuntime = async (
  ctx: FactoryContext,
  layer: SceneLayer,
  createKey: string
): Promise<PanoramaRuntime> => {
  const dataSource = new CustomDataSource(`panorama-${layer.id}`)
  createEntities(dataSource, layer)
  if (ctx.viewer.isDestroyed()) throw new Error('场景已销毁')
  await ctx.viewer.dataSources.add(dataSource)
  const runtime: PanoramaRuntime = { kind: 'panorama', layerId: layer.id, createKey, dataSource }
  applyPanoramaState(runtime, layer, true)
  return runtime
}

export const destroyPanoramaRuntime = (ctx: FactoryContext, runtime: PanoramaRuntime) => {
  if (!ctx.viewer.isDestroyed()) ctx.viewer.dataSources.remove(runtime.dataSource, true)
}
