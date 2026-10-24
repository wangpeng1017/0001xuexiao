import type { UserRole } from '@/store/modules/systemStore/systemStore.d'

export interface UserItem {
  id: string
  username: string
  nickname: string
  role: UserRole
  disabled: boolean
  createTime: string
}

export interface UserListParams {
  page: number
  limit: number
  keyword?: string
}

export interface CreateUserParams {
  username: string
  nickname: string
  role: UserRole
  password?: string
}

export interface CreateUserResult {
  id: string
  initialPassword: string
}

export interface EditUserParams {
  id: string
  nickname?: string
  role?: UserRole
  disabled?: boolean
}

export interface ResetPasswordResult {
  initialPassword: string
}

export interface ImportUserResult {
  line: number
  username: string
  ok: boolean
  reason: string
  initialPassword: string
}
