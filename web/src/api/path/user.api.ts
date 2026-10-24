import { http } from '@/api/http'
import { httpErrorHandle } from '@/utils'
import { ContentTypeEnum, ModuleTypeEnum, RequestHttpEnum } from '@/enums/httpEnum'
import {
  CreateUserParams,
  CreateUserResult,
  EditUserParams,
  ImportUserResult,
  ResetPasswordResult,
  UserItem,
  UserListParams
} from './user'

// * 用户列表
export const userListApi = async (params: UserListParams) => {
  try {
    const res = await http(RequestHttpEnum.GET)<UserItem[]>(`${ModuleTypeEnum.USER}/list`, params)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 新建用户
export const createUserApi = async (data: CreateUserParams) => {
  try {
    const res = await http(RequestHttpEnum.POST)<CreateUserResult>(`${ModuleTypeEnum.USER}/create`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 编辑用户
export const editUserApi = async (data: EditUserParams) => {
  try {
    const res = await http(RequestHttpEnum.POST)(`${ModuleTypeEnum.USER}/edit`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 重置密码
export const resetUserPasswordApi = async (data: { id: string }) => {
  try {
    const res = await http(RequestHttpEnum.POST)<ResetPasswordResult>(
      `${ModuleTypeEnum.USER}/resetPassword`,
      data
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * CSV 批量导入
export const importUsersApi = async (data: FormData) => {
  try {
    const res = await http(RequestHttpEnum.POST)<ImportUserResult[]>(
      `${ModuleTypeEnum.USER}/import`,
      data,
      ContentTypeEnum.FORM_DATA
    )
    return res
  } catch {
    httpErrorHandle()
  }
}
