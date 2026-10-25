import axios, { AxiosResponse, AxiosRequestConfig, Axios, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { RequestHttpHeaderEnum, ResultEnum, ModuleTypeEnum } from '@/enums/httpEnum'
import { PageEnum, ErrorPageNameMap } from '@/enums/pageEnum'
import { StorageEnum } from '@/enums/storageEnum'
import { axiosPre } from '@/settings/httpSetting'
import { SystemStoreEnum, SystemStoreUserInfoEnum } from '@/store/modules/systemStore/systemStore.d'
import {
  redirectErrorPage,
  getLocalStorage,
  routerTurnByName,
  isPreview,
  clearLocalStorage,
  updateStoredUserInfo
} from '@/utils'
import { fetchAllowList } from './axios.config'
import includes from 'lodash/includes'

export interface MyResponseType<T> {
  code: ResultEnum
  data: T
  msg?: string
  message?: string
  count?: number
}

export interface MyRequestInstance extends Axios {
  <T = any>(config: AxiosRequestConfig): Promise<MyResponseType<T>>
}

const axiosInstance = axios.create({
  baseURL: `${import.meta.env.PROD ? import.meta.env.VITE_PRO_PATH : ''}${axiosPre}`,
  timeout: ResultEnum.TIMEOUT
}) as unknown as MyRequestInstance

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 获取 token：白名单接口（如预览 getData）也带上 token，有权限时才能拿到完整数据
    const info = getLocalStorage(StorageEnum.GO_SYSTEM_STORE)
    const userInfo = info?.[SystemStoreEnum.USER_INFO]
    if (userInfo?.[SystemStoreUserInfoEnum.USER_TOKEN]) {
      config.headers[userInfo[SystemStoreUserInfoEnum.TOKEN_NAME] || 'token'] =
        userInfo[SystemStoreUserInfoEnum.USER_TOKEN]
    }
    // 白名单校验（未登录也可访问）
    if (includes(fetchAllowList, config.url)) return config
    // 重新登录
    if (!info) {
      routerTurnByName(PageEnum.BASE_LOGIN_NAME)
      return config
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
axiosInstance.interceptors.response.use(
  (res: AxiosResponse) => {
    const responseData = res.data as { code?: number; msg?: string }
    const code = responseData?.code

    if (code === undefined || code === null) return Promise.resolve(res.data)

    // 登录过期 / 账号被禁用
    if (code === ResultEnum.TOKEN_OVERDUE) {
      clearLocalStorage(StorageEnum.GO_SYSTEM_STORE)
      window['$message'].error(window['$t']('http.token_overdue_message'))
      if (!document.location.hash.includes(PageEnum.BASE_LOGIN)) {
        routerTurnByName(PageEnum.BASE_LOGIN_NAME)
      }
      return Promise.resolve(res.data)
    }

    // 必须先修改密码
    if (code === ResultEnum.MUST_CHANGE_PASSWORD) {
      updateStoredUserInfo({ [SystemStoreUserInfoEnum.MUST_CHANGE_PWD]: true })
      window['$message'].warning(responseData?.msg || '请先修改密码')
      if (!document.location.hash.includes(PageEnum.CHANGE_PASSWORD)) {
        routerTurnByName(PageEnum.CHANGE_PASSWORD_NAME)
      }
      return Promise.resolve(res.data)
    }

    // 预览页面错误不进行处理
    if (isPreview()) {
      return Promise.resolve(res.data)
    }

    // 成功
    if (code === ResultEnum.SUCCESS) {
      return Promise.resolve(res.data)
    }

    // 固定错误码重定向
    if (ErrorPageNameMap.get(code)) {
      redirectErrorPage(code)
      return Promise.resolve(res.data)
    }

    // 提示错误
    window['$message'].error(responseData?.msg || window['$t']('http.error_message'))
    return Promise.resolve(res.data)
  },
  (err: AxiosError) => {
    const status = err.response?.status
    switch (status) {
      case 401:
        routerTurnByName(PageEnum.BASE_LOGIN_NAME)
        return Promise.reject(err)

      default:
        return Promise.reject(err)
    }
  }
)

export default axiosInstance
