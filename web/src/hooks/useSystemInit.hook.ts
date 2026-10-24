import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { SystemStoreEnum, SystemStoreUserInfoEnum } from '@/store/modules/systemStore/systemStore.d'
import { ResultEnum } from '@/enums/httpEnum'
import { ossUrlApi, fetchMeApi } from '@/api/path'
import { loginCheck } from '@/utils'

// * 初始化
export const useSystemInit = async () => {
  const systemStore = useSystemStore()

  // 获取 OSS 信息的 url 地址，用来拼接展示图片的地址
  const getOssUrl = async () => {
    const res = await ossUrlApi({})
    if (res && res.code === ResultEnum.SUCCESS) {
      systemStore.setItem(SystemStoreEnum.FETCH_INFO, {
        OSSUrl: res.data?.bucketURL
      })
    }
  }

  // 刷新当前用户信息（角色、强制改密状态等）
  const refreshUserInfo = async () => {
    if (!loginCheck()) return
    const res = await fetchMeApi()
    if (res && res.code === ResultEnum.SUCCESS && res.data) {
      const { id, username, nickname, role, mustChangePwd } = res.data
      systemStore.setItem(SystemStoreEnum.USER_INFO, {
        ...systemStore.getUserInfo,
        [SystemStoreUserInfoEnum.USER_ID]: id,
        [SystemStoreUserInfoEnum.USER_NAME]: username,
        [SystemStoreUserInfoEnum.NICK_NAME]: nickname,
        [SystemStoreUserInfoEnum.ROLE]: role,
        [SystemStoreUserInfoEnum.MUST_CHANGE_PWD]: mustChangePwd
      })
    }
  }

  // 执行
  getOssUrl()
  refreshUserInfo()
}
