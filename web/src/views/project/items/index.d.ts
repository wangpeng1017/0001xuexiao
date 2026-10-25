export type Chartype = {
  id: string
  title: string // 标题
  label?: string // 标签
  time: string // 更新时间
  image: string // 预览图地址
  createId: string // 创建者 id
  createUserName: string // 创建者姓名
  release: boolean // false 未发布 | true 已发布
  teamId: string // 所属团队 id（空串为个人）
  teamName: string // 所属团队名称
  isTemplate: boolean // 是否模板
  templateCategory: string // 模板分类
  version: number // 版本号
  updateUserName: string // 最后修改人
}

export type ChartList = Chartype[]
