import { HeadingPitchRange, ImageryLayer, Viewer } from 'cesium'
import type { Scene3DOption as SceneOption, SceneLayer, SceneLayerSet } from './types'
import { addNaturalEarthBaseLayer } from './viewer'
import { flyToPoint, flyToRectangle } from './camera'
import {
  buildLayerCreateKey,
  createLayerRuntime,
  destroyLayerRuntime,
  formatLayerError,
  updateLayerRuntime
} from './layerFactories'
import { FactoryContext, LayerRuntime } from './layerFactories/base'

interface RuntimeEntry {
  runtime: LayerRuntime
  layer: SceneLayer
}

export interface SceneSyncCallbacks {
  onLayerError: (layerId: string, message: string | null) => void
}

const flattenLayers = (sets: SceneLayerSet[]) => {
  const result: Array<{ layer: SceneLayer; setVisible: boolean }> = []
  for (const set of sets) {
    for (const layer of set.layers) {
      result.push({ layer, setVisible: set.visible })
    }
  }
  return result
}

export class SceneSyncer {
  private viewer: Viewer
  private callbacks: SceneSyncCallbacks
  private ctx: FactoryContext
  private entries = new Map<string, RuntimeEntry>()
  private failed = new Map<string, { key: string; message: string }>()
  private baseLayer: ImageryLayer | null = null
  private baseKind: string | null = null
  private latest: SceneOption | null = null
  private busy = false
  private disposed = false

  constructor(viewer: Viewer, callbacks: SceneSyncCallbacks) {
    this.viewer = viewer
    this.ctx = { viewer }
    this.callbacks = callbacks
  }

  sync(option: SceneOption) {
    if (this.disposed || this.viewer.isDestroyed()) return
    this.latest = JSON.parse(JSON.stringify(option)) as SceneOption
    if (!this.busy) void this.flush()
  }

  private async flush() {
    this.busy = true
    try {
      while (this.latest && !this.disposed && !this.viewer.isDestroyed()) {
        const option = this.latest
        this.latest = null
        await this.apply(option)
      }
    } finally {
      this.busy = false
    }
  }

  private async ensureBaseLayer(kind: string) {
    if (this.baseKind === kind) return
    if (this.baseLayer && !this.viewer.isDestroyed()) {
      this.viewer.imageryLayers.remove(this.baseLayer, true)
    }
    this.baseLayer = null
    this.baseKind = null
    if (kind !== 'naturalEarth') return
    const layer = await addNaturalEarthBaseLayer(this.viewer)
    if (this.disposed || this.viewer.isDestroyed()) {
      if (layer && !this.viewer.isDestroyed()) this.viewer.imageryLayers.remove(layer, true)
      return
    }
    this.baseLayer = layer
    this.baseKind = kind
  }

  private async apply(option: SceneOption) {
    try {
      await this.ensureBaseLayer(option.baseLayer || 'naturalEarth')
      if (this.disposed || this.viewer.isDestroyed()) return

      const flat = flattenLayers(option.layerSets || [])
      const alive = new Set(flat.map(item => item.layer.id))
      for (const [id, entry] of this.entries) {
        if (!alive.has(id)) {
          destroyLayerRuntime(this.ctx, entry.runtime)
          this.entries.delete(id)
        }
      }
      for (const id of Array.from(this.failed.keys())) {
        if (!alive.has(id)) this.failed.delete(id)
      }

      for (const { layer, setVisible } of flat) {
        if (this.disposed || this.viewer.isDestroyed()) return
        await this.syncLayer(layer, setVisible)
      }
      this.reorder(option.layerSets || [])
    } catch (error) {
      console.error('[Scene3D] sync failed', error)
    }
  }

  private async syncLayer(layer: SceneLayer, setVisible: boolean) {
    const createKey = buildLayerCreateKey(layer)
    const entry = this.entries.get(layer.id)
    if (entry) {
      if (entry.runtime.createKey === createKey) {
        entry.layer = layer
        try {
          updateLayerRuntime(entry.runtime, layer, setVisible)
          this.clearError(layer.id)
        } catch (error) {
          this.setError(layer.id, createKey, formatLayerError(error))
        }
        return
      }
      destroyLayerRuntime(this.ctx, entry.runtime)
      this.entries.delete(layer.id)
    }

    const failed = this.failed.get(layer.id)
    if (failed && failed.key === createKey) return

    try {
      const runtime = await createLayerRuntime(this.ctx, layer, createKey)
      if (this.disposed || this.viewer.isDestroyed()) {
        destroyLayerRuntime(this.ctx, runtime)
        return
      }
      this.entries.set(layer.id, { runtime, layer })
      try {
        updateLayerRuntime(runtime, layer, setVisible)
      } catch {
        // 创建时的初次样式应用失败不影响图层本身
      }
      this.clearError(layer.id)
    } catch (error) {
      this.setError(layer.id, createKey, formatLayerError(error))
    }
  }

  private setError(layerId: string, key: string, message: string) {
    this.failed.set(layerId, { key, message })
    this.callbacks.onLayerError(layerId, message)
  }

  private clearError(layerId: string) {
    if (!this.failed.has(layerId)) return
    this.failed.delete(layerId)
    this.callbacks.onLayerError(layerId, null)
  }

  private reorder(sets: SceneLayerSet[]) {
    if (this.viewer.isDestroyed()) return
    const flat = flattenLayers(sets)
    const bottomFirst = [...flat].reverse()
    for (const { layer } of bottomFirst) {
      const entry = this.entries.get(layer.id)
      if (!entry) continue
      const runtime = entry.runtime
      if (runtime.kind === 'imagery') {
        this.viewer.imageryLayers.raiseToTop(runtime.imageryLayer)
      }
    }
    for (const { layer } of bottomFirst) {
      const entry = this.entries.get(layer.id)
      if (!entry) continue
      if (entry.runtime.kind === 'vector' || entry.runtime.kind === 'panorama') {
        this.viewer.dataSources.raiseToTop(entry.runtime.dataSource)
      }
    }
    for (const { layer } of bottomFirst) {
      const entry = this.entries.get(layer.id)
      if (!entry) continue
      if (entry.runtime.kind === 'model') {
        this.viewer.scene.primitives.raiseToTop(entry.runtime.primitive)
      }
    }
  }

  flyToLayer(layerId: string): boolean {
    if (this.viewer.isDestroyed()) return false
    const entry = this.entries.get(layerId)
    if (!entry) return false
    const runtime = entry.runtime
    if (runtime.kind === 'imagery') {
      flyToRectangle(this.viewer, runtime.imageryLayer.rectangle)
      return true
    }
    if (runtime.kind === 'vector') {
      void this.viewer.flyTo(runtime.dataSource, { duration: 1.2 })
      return true
    }
    if (runtime.kind === 'model') {
      if (runtime.model) {
        const sphere = runtime.model.boundingSphere
        this.viewer.camera.flyToBoundingSphere(sphere, {
          duration: 1.2,
          offset: new HeadingPitchRange(0, -Math.PI / 4, Math.max(sphere.radius * 3, 50))
        })
      } else if (runtime.tileset) {
        void this.viewer.flyTo(runtime.tileset, { duration: 1.2 })
      }
      return true
    }
    if (runtime.kind === 'panorama') {
      const point = (entry.layer.source.points || [])[0]
      if (!point) return false
      flyToPoint(this.viewer, Number(point.lon), Number(point.lat), 900, -90)
      return true
    }
    return false
  }

  dispose() {
    this.disposed = true
    this.latest = null
    for (const entry of this.entries.values()) {
      try {
        destroyLayerRuntime(this.ctx, entry.runtime)
      } catch {
        // 忽略销毁异常
      }
    }
    this.entries.clear()
    if (this.baseLayer && !this.viewer.isDestroyed()) {
      this.viewer.imageryLayers.remove(this.baseLayer, true)
    }
    this.baseLayer = null
    this.baseKind = null
  }
}
