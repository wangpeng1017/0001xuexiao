import { PublicConfigClass } from '@/packages/public'
import { CreateComponentType } from '@/packages/index.d'
import { ImageCarouselConfig } from './index'
import cloneDeep from 'lodash/cloneDeep'
import carousel1 from '@/assets/images/carousel/1.svg'
import carousel2 from '@/assets/images/carousel/2.svg'
import carousel3 from '@/assets/images/carousel/3.svg'

export const option = {
  // 图片资源列表（本地资源，断网可用）
  dataset: [carousel1, carousel2, carousel3],
  // 自动播放
  autoplay: true,
  // 自动播放的间隔（豪秒）
  interval: 5000,
  // 每页显示的图片数量
  slidesPerview: 1,
  // 轮播方向
  direction: "horizontal",
  // 拖曳切换
  draggable: true,
  // 居中显示
  centeredSlides: false,
  // 过渡效果
  effect: "slide",
  // 是否显示指示点
  showDots: true,
  // 指示器样式
  dotType: "dot",
  // 指示器位置
  dotPlacement: "bottom",
  // 显示箭头
  showArrow: false,
  // 图片样式
  fit: "contain",
}

export default class Config extends PublicConfigClass implements CreateComponentType {
  public key = ImageCarouselConfig.key
  public chartConfig = cloneDeep(ImageCarouselConfig)
  public option = cloneDeep(option)
}
