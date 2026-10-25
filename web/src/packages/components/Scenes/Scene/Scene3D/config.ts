import { PublicConfigClass } from '@/packages/public'
import { CreateComponentType } from '@/packages/index.d'
import cloneDeep from 'lodash/cloneDeep'
import { Scene3DConfig } from './index'
import { createDefaultSceneOption } from '@/components/Scene3D/defaults'

export const option = createDefaultSceneOption()

export default class Config extends PublicConfigClass implements CreateComponentType {
  public key = Scene3DConfig.key
  public chartConfig = cloneDeep(Scene3DConfig)
  public option = cloneDeep(option)
}
