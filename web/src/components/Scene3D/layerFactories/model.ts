import {
  Cartesian3,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Color,
  ColorBlendMode,
  Model
} from 'cesium'
import { SceneLayer } from '../types'
import { buildModelMatrix, buildTilesetOffsetMatrix } from '../camera'
import { FactoryContext, ModelRuntime, requireUrl } from './base'

const HEIGHT_COLORS = ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']

const clampOpacity = (value: number) => Math.min(Math.max(Number(value) || 0, 0), 1)

const isTileset = (format?: string, url?: string) => {
  if (format === '3dtiles') return true
  if (format === 'gltf') return false
  return /tileset\.json(\?|$)/i.test(url || '')
}

const buildTilesetStyle = (runtime: ModelRuntime, layer: SceneLayer) => {
  const opacity = clampOpacity(layer.opacity)
  const pointSize = Number(layer.style.pointSize) || 0
  const colorBy = layer.style.colorBy
  const style: Record<string, unknown> = {}
  if (pointSize > 0) style.pointSize = String(pointSize)

  if (colorBy === 'height' && runtime.tilesetCenter) {
    const center = Cartesian3.clone(runtime.tilesetCenter, new Cartesian3())
    const radius = Math.max(runtime.tileset?.boundingSphere.radius || 100, 10)
    const thresholds = [
      center.z - radius * 0.5,
      center.z - radius * 0.15,
      center.z + radius * 0.15,
      center.z + radius * 0.5
    ]
    const conditions: Array<[string, string]> = thresholds.map((threshold, index) => [
      `\${POSITION}[2] < ${threshold.toFixed(2)}`,
      `color('${HEIGHT_COLORS[index]}', ${opacity})`
    ])
    conditions.push(['true', `color('${HEIGHT_COLORS[4]}', ${opacity})`])
    style.color = { conditions }
  } else if (opacity < 1) {
    style.color = `color('white', ${opacity})`
  }
  return new Cesium3DTileStyle(style)
}

const updateModel = (runtime: ModelRuntime, layer: SceneLayer, setVisible: boolean) => {
  const visible = setVisible && layer.visible
  const opacity = clampOpacity(layer.opacity)
  if (runtime.model) {
    runtime.model.show = visible
    runtime.model.modelMatrix = buildModelMatrix(
      layer.source.position || { lon: 116.39, lat: 39.9, height: 0 },
      layer.source.rotation || { heading: 0, pitch: 0, roll: 0 },
      Number(layer.source.scale) || 1
    )
    runtime.model.color = Color.WHITE.withAlpha(opacity)
    runtime.model.colorBlendMode = ColorBlendMode.MIX
    runtime.model.colorBlendAmount = 0
  }
  if (runtime.tileset) {
    runtime.tileset.show = visible
    if (runtime.tilesetCenter) {
      runtime.tileset.modelMatrix = buildTilesetOffsetMatrix(
        runtime.tilesetCenter,
        layer.source.position || { lon: 0, lat: 0, height: 0 }
      )
    }
    runtime.tileset.style = buildTilesetStyle(runtime, layer)
  }
}

export const createModelRuntime = async (
  ctx: FactoryContext,
  layer: SceneLayer,
  createKey: string
): Promise<ModelRuntime> => {
  const url = requireUrl(layer.source.url)
  if (isTileset(layer.source.format, url)) {
    const tileset = await Cesium3DTileset.fromUrl(url)
    if (ctx.viewer.isDestroyed()) {
      tileset.destroy()
      throw new Error('场景已销毁')
    }
    const tilesetCenter = Cartesian3.clone(tileset.boundingSphere.center, new Cartesian3())
    ctx.viewer.scene.primitives.add(tileset)
    const runtime: ModelRuntime = {
      kind: 'model',
      layerId: layer.id,
      createKey,
      primitive: tileset,
      tileset,
      tilesetCenter
    }
    updateModel(runtime, layer, true)
    return runtime
  }

  const model = await Model.fromGltfAsync({
    url,
    modelMatrix: buildModelMatrix(
      layer.source.position || { lon: 116.39, lat: 39.9, height: 0 },
      layer.source.rotation || { heading: 0, pitch: 0, roll: 0 },
      Number(layer.source.scale) || 1
    )
  })
  if (ctx.viewer.isDestroyed()) {
    model.destroy()
    throw new Error('场景已销毁')
  }
  ctx.viewer.scene.primitives.add(model)
  const runtime: ModelRuntime = {
    kind: 'model',
    layerId: layer.id,
    createKey,
    primitive: model,
    model
  }
  updateModel(runtime, layer, true)
  return runtime
}

export const updateModelRuntime = (
  runtime: ModelRuntime,
  layer: SceneLayer,
  setVisible: boolean
) => {
  updateModel(runtime, layer, setVisible)
}

export const destroyModelRuntime = (ctx: FactoryContext, runtime: ModelRuntime) => {
  if (!ctx.viewer.isDestroyed()) ctx.viewer.scene.primitives.remove(runtime.primitive)
}
