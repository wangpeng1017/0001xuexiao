import type { UserRole } from '@/store/modules/systemStore/systemStore.d'

export interface UserInfo {
  /**
   * 用户 id
   */
  id: string
  /**
   * 用户名
   */
  username: string
  /**
   * 姓名
   */
  nickname: string
  /**
   * 角色
   */
  role: UserRole
  /**
   * 是否需要强制修改密码
   */
  mustChangePwd: boolean
}

export interface LoginResult {
  token: {
    /**
     * token 值
     */
    tokenValue: string
    /**
     * token key
     */
    tokenName: string
  }
  userinfo: UserInfo
}
