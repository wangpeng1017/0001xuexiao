import axios from 'axios'
import { getLocalStorage } from '@/utils'
import { StorageEnum } from '@/enums/storageEnum'
import { SystemStoreEnum, SystemStoreUserInfoEnum } from '@/store/modules/systemStore/systemStore.d'
import { DataFileItem, MaterialItem } from './types'

// M3/M4 的接口在本分支可能不存在：使用独立实例，避免全局拦截器触发 404 跳转
const raw = axios.create({ baseURL: '/api/goview', timeout: 15000 })

raw.interceptors.request.use(config => {
  const info = getLocalStorage(StorageEnum.GO_SYSTEM_STORE)
  const userInfo = info?.[SystemStoreEnum.USER_INFO]
  if (userInfo) {
    const tokenName = userInfo[SystemStoreUserInfoEnum.TOKEN_NAME] || 'Authorization'
    const token = userInfo[SystemStoreUserInfoEnum.USER_TOKEN]
    if (token) config.headers[tokenName] = token
  }
  return config
})

const listData = <T>(res: any): T[] | null => {
  const data = res?.data
  if (!data || data.code !== 200) return null
  return Array.isArray(data.data) ? (data.data as T[]) : null
}

export const fetchDataFileList = async (kind: string): Promise<DataFileItem[] | null> => {
  try {
    const res = await raw.get('/datafile/list', {
      params: { page: 1, limit: 200, kind, status: 'success' }
    })
    return listData<DataFileItem>(res)
  } catch {
    return null
  }
}

export const fetchMaterialList = async (category: string): Promise<MaterialItem[] | null> => {
  try {
    const res = await raw.get('/material/list', {
      params: { category, page: 1, limit: 200 }
    })
    return listData<MaterialItem>(res)
  } catch {
    return null
  }
}

export const uploadImage = async (file: File): Promise<string | null> => {
  try {
    const body = new FormData()
    body.append('object', file)
    const res = await raw.post('/project/upload', body)
    const data = res?.data
    if (data?.code !== 200) return null
    return data?.data?.fileurl || null
  } catch {
    return null
  }
}
