import { ConfigType, PackagesCategoryEnum, ChartFrameEnum } from '@/packages/index.d'
import { ChatCategoryEnum, ChatCategoryEnumName } from '../../index.d'

export const RtspVideoConfig: ConfigType = {
  key: 'RtspVideo',
  chartKey: 'VRtspVideo',
  conKey: 'VCRtspVideo',
  title: '摄像头视频',
  category: ChatCategoryEnum.MORE,
  categoryName: ChatCategoryEnumName.MORE,
  package: PackagesCategoryEnum.INFORMATIONS,
  chartFrame: ChartFrameEnum.COMMON,
  image: 'video.png'
}
