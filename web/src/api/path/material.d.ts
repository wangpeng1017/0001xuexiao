export type MaterialCategory = 'model' | 'map' | 'image2d'
export type MaterialScope = 'public' | 'private'

export interface MaterialItem {
  id: string
  category: MaterialCategory
  name: string
  url: string
  thumb: string
  scope: MaterialScope
  createUserName: string
  createTime: string
}

export interface MaterialListParams {
  category?: MaterialCategory
  scope?: MaterialScope
  keyword?: string
  page?: number
  limit?: number
}
