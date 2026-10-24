import { StorageEnum } from '@/enums/storageEnum'
import { RoleEnum } from '@/enums/roleEnum'
import {
  SystemStoreEnum,
  SystemStoreUserInfoEnum,
  UserInfoType,
  UserRole
} from '@/store/modules/systemStore/systemStore.d'
import { getLocalStorage, setLocalStorage } from './storage'

const readStore = () => getLocalStorage(StorageEnum.GO_SYSTEM_STORE)

export const getStoredUserInfo = (): UserInfoType => {
  return readStore()?.[SystemStoreEnum.USER_INFO] || {}
}

export const getStoredRole = (): UserRole | undefined => {
  return getStoredUserInfo()[SystemStoreUserInfoEnum.ROLE]
}

export const isAdminRole = (): boolean => {
  return getStoredRole() === RoleEnum.ADMIN
}

export const isMustChangePwd = (): boolean => {
  return getStoredUserInfo()[SystemStoreUserInfoEnum.MUST_CHANGE_PWD] === true
}

export const updateStoredUserInfo = (patch: Partial<UserInfoType>) => {
  const store = readStore() || {}
  const userInfo = {
    ...(store[SystemStoreEnum.USER_INFO] || {}),
    ...patch
  }
  setLocalStorage(StorageEnum.GO_SYSTEM_STORE, {
    ...store,
    [SystemStoreEnum.USER_INFO]: userInfo
  })
}
