//语言
import { lang } from '@/settings/designSetting'
import { createI18n } from 'vue-i18n' //引入vue-i18n组件
import { LangEnum } from '@/enums/styleEnum'
import zh from './zh/index'
import en from './en/index'

const i18n = createI18n({
  legacy: false,
  globalInjection:true,
  // 固定中文：已去掉语言切换，忽略浏览器里残留的语言设置
  locale: lang,
  fallbackLocale: lang,
  messages: {
    [LangEnum.ZH]: zh,
    [LangEnum.EN]: en
  }
})

export default i18n
