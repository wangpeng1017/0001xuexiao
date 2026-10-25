import { ChartFrameEnum, ConfigType, PackagesCategoryEnum } from '@/packages/index.d'

export const Scene3DConfig: ConfigType = {
  key: 'Scene3D',
  chartKey: 'VScene3D',
  conKey: 'VCScene3D',
  title: '三维场景',
  category: 'Scene',
  categoryName: '场景',
  package: PackagesCategoryEnum.SCENES,
  chartFrame: ChartFrameEnum.STATIC,
  image: 'scene3d.svg'
}
