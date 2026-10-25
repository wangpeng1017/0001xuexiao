import { PublicConfigClass } from '@/packages/public'
import { CreateComponentType } from '@/packages/index.d'
import { RtspVideoConfig } from './index'
import cloneDeep from 'lodash/cloneDeep'

export const option = {
  rtspUrl: '',
  streamId: '',
  autoplay: true,
  muted: true,
  fit: 'contain'
}

export default class Config extends PublicConfigClass implements CreateComponentType {
  public key = RtspVideoConfig.key
  public chartConfig = cloneDeep(RtspVideoConfig)
  public option = cloneDeep(option)
}
