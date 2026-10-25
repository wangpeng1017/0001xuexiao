import { http } from '@/api/http'
import { httpErrorHandle } from '@/utils'
import { RequestHttpEnum } from '@/enums/httpEnum'
import { TeamDetail, TeamItem, UserOption } from './team'

// * 团队列表
export const teamListApi = async () => {
  try {
    const res = await http(RequestHttpEnum.GET)<TeamItem[]>('/team/list')
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 团队详情
export const teamDetailApi = async (id: string) => {
  try {
    const res = await http(RequestHttpEnum.GET)<TeamDetail>('/team/detail', { id })
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 新建团队
export const teamCreateApi = async (data: { name: string; leaderId?: string }) => {
  try {
    const res = await http(RequestHttpEnum.POST)<{ id: string }>('/team/create', data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 编辑团队
export const teamEditApi = async (data: { id: string; name?: string; leaderId?: string }) => {
  try {
    const res = await http(RequestHttpEnum.POST)('/team/edit', data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 删除团队
export const teamDeleteApi = async (id: string) => {
  try {
    const res = await http(RequestHttpEnum.DELETE)('/team/delete', { id })
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 添加成员
export const teamAddMembersApi = async (data: { id: string; userIds: string[] }) => {
  try {
    const res = await http(RequestHttpEnum.POST)('/team/addMembers', data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 移除成员
export const teamRemoveMemberApi = async (data: { id: string; userId: string }) => {
  try {
    const res = await http(RequestHttpEnum.POST)('/team/removeMember', data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 用户下拉选项
export const userOptionsApi = async (keyword = '') => {
  try {
    const res = await http(RequestHttpEnum.GET)<UserOption[]>('/user/options', { keyword })
    return res
  } catch {
    httpErrorHandle()
  }
}
