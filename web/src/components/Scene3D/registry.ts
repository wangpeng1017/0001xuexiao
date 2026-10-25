import { LayerPosition, Scene3DOption, SceneCamera, SceneMode } from './types'

export interface SceneControllerApi {
  option: Scene3DOption
  captureCamera: () => SceneCamera | null
  applyCamera: (camera: SceneCamera, duration?: number) => void
  startPickPosition: (callback: (position: LayerPosition) => void) => void
  cancelPick: () => void
  flyToLayer: (layerId: string) => boolean
  setSceneMode: (mode: SceneMode) => void
  getSceneMode: () => SceneMode
  isReady: () => boolean
}

const controllers = new WeakMap<object, SceneControllerApi>()

export const registerSceneController = (option: Scene3DOption, controller: SceneControllerApi) => {
  controllers.set(option, controller)
}

export const unregisterSceneController = (option: Scene3DOption, controller: SceneControllerApi) => {
  if (controllers.get(option) === controller) controllers.delete(option)
}

export const getSceneController = (option: Scene3DOption): SceneControllerApi | undefined => {
  return controllers.get(option)
}
