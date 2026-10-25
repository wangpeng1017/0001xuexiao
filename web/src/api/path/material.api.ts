import { http } from '@/api/http'
import { httpErrorHandle } from '@/utils'
import { ContentTypeEnum, RequestHttpEnum } from '@/enums/httpEnum'
import { MaterialItem, MaterialListParams } from './material'

// * 素材列表
export const materialListApi = async (params: MaterialListParams) => {
  try {
    const res = await http(RequestHttpEnum.GET)<MaterialItem[]>('/material/list', params)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 上传素材
export const materialUploadApi = async (data: FormData) => {
  try {
    const res = await http(RequestHttpEnum.POST)<MaterialItem>(
      '/material/upload',
      data,
      ContentTypeEnum.FORM_DATA
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 上传素材缩略图
export const materialThumbApi = async (id: string, file: File) => {
  const data = new FormData()
  data.append('file', file)
  try {
    const res = await http(RequestHttpEnum.POST)<{ thumb: string }>(
      `/material/thumb?id=${encodeURIComponent(id)}`,
      data,
      ContentTypeEnum.FORM_DATA
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 删除素材
export const materialDeleteApi = async (ids: string) => {
  try {
    const res = await http(RequestHttpEnum.DELETE)('/material/delete', { ids })
    return res
  } catch {
    httpErrorHandle()
  }
}
