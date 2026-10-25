export type ProjectItem = {
  /**
   * 项目 id
   */
  id: string
  /**
   * 项目名称
   */
  projectName: string
  /**
   * 项目状态:\
   * -1: 未发布\
   * 1: 已发布
   */
  state: number
  /**
   * 创建时间
   */
  createTime: string
  /**
   * 更新时间
   */
  updateTime: string
  /**
   * 预览图片url
   */
  indexImage: string
  /**
   * 创建者 id
   */
  createUserId: string
  /**
   * 创建者姓名
   */
  createUserName: string
  /**
   * 项目备注
   */
  remarks: string
  /**
   * 排序值
   */
  sortOrder: number
  /**
   * 所属团队 id（空串表示个人项目）
   */
  teamId: string
  /**
   * 所属团队名称
   */
  teamName: string
  /**
   * 是否模板
   */
  isTemplate: boolean
  /**
   * 模板分类
   */
  templateCategory: string
  /**
   * 数据版本号（乐观锁）
   */
  version: number
  /**
   * 最后修改人姓名
   */
  updateUserName: string
}

export type ProjectTemplateCategory = 'campus' | 'device' | 'data' | 'other'

export interface ProjectTemplateParams {
  category?: ProjectTemplateCategory
}

export interface ProjectSaveResult {
  version: number
}

export interface ProjectSaveConflict {
  updateUserName: string
  updateTime: string
  version: number
}

export interface ProjectDetail extends ProjectItem {
  /**
   * 项目参数
   */
   content: string
}