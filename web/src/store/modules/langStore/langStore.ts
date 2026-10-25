import { defineStore } from 'pinia'
import { lang } from '@/settings/designSetting'
import { LangStateType } from './langStore.d'
import { LangEnum } from '@/enums/styleEnum'
import { setLocalStorage, reloadRoutePage } from '@/utils'
import { StorageEnum } from '@/enums/storageEnum'
import { useSettingStore } from '@/store/modules/settingStore/settingStore'

const { GO_LANG_STORE } = StorageEnum
// 语言
export const useLangStore = defineStore({
  id: 'useLangStore',
  // 固定中文：已去掉语言切换，不再读取浏览器里残留的语言设置
  state: (): LangStateType => ({
    lang
  }),
  getters: {
    getLang(): LangEnum {
      return this.lang
    }
  },
  actions: {
    changeLang(lang: LangEnum): void {
      const settingStore = useSettingStore()
      if (this.lang === lang) return
      this.lang = lang
      setLocalStorage(GO_LANG_STORE, this.$state)

      if (settingStore.getChangeLangReload) {
        reloadRoutePage()
      }
    }
  }
})
