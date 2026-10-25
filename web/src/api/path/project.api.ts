import { http } from '@/api/http'
import { httpErrorHandle } from '@/utils'
import { ContentTypeEnum, RequestHttpEnum, ModuleTypeEnum } from '@/enums/httpEnum'
import { ProjectItem, ProjectDetail, ProjectTemplateParams } from './project'

// * 项目列表
export const projectListApi = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.GET)<ProjectItem[]>(`${ModuleTypeEnum.PROJECT}/list`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 新增项目
export const createProjectApi = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.POST)<{
      /**
       * 项目id
       */
      id: string
    }>(`${ModuleTypeEnum.PROJECT}/create`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 获取项目
export const fetchProjectApi = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.GET)<ProjectDetail>(`${ModuleTypeEnum.PROJECT}/getData`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 保存项目
export const saveProjectApi = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.POST)(
      `${ModuleTypeEnum.PROJECT}/save/data`,
      data,
      ContentTypeEnum.FORM_DATA
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 修改项目基础信息
export const updateProjectApi = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.POST)(`${ModuleTypeEnum.PROJECT}/edit`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 删除项目
export const deleteProjectApi = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.DELETE)(`${ModuleTypeEnum.PROJECT}/delete`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 修改发布状态 [-1未发布,1发布]
export const changeProjectReleaseApi = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.PUT)(`${ModuleTypeEnum.PROJECT}/publish`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 复制项目
export const copyProjectApi = async (data: { id: string }) => {
  try {
    const res = await http(RequestHttpEnum.POST)<{ id: string }>(
      `${ModuleTypeEnum.PROJECT}/copy`,
      data
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 项目排序
export const sortProjectApi = async (data: { ids: string[] }) => {
  try {
    const res = await http(RequestHttpEnum.PUT)(`${ModuleTypeEnum.PROJECT}/sort`, data)
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 设为模板 / 取消模板
export const setProjectTemplateApi = async (data: {
  id: string
  isTemplate: boolean
  templateCategory?: string
}) => {
  try {
    const res = await http(RequestHttpEnum.POST)(
      `${ModuleTypeEnum.PROJECT}/setTemplate`,
      data
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 模板列表
export const projectTemplatesApi = async (params: ProjectTemplateParams = {}) => {
  try {
    const res = await http(RequestHttpEnum.GET)<ProjectItem[]>(
      `${ModuleTypeEnum.PROJECT}/templates`,
      params
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 从模板新建项目
export const createFromTemplateApi = async (data: {
  templateId: string
  projectName: string
  teamId?: string
}) => {
  try {
    const res = await http(RequestHttpEnum.POST)<{ id: string }>(
      `${ModuleTypeEnum.PROJECT}/createFromTemplate`,
      data
    )
    return res
  } catch {
    httpErrorHandle()
  }
}

// * 上传文件
export const uploadFile = async (data: object) => {
  try {
    const res = await http(RequestHttpEnum.POST)<{
      /**
       * 文件地址
       */
      fileName: string,
      fileurl: string,
    }>(`${ModuleTypeEnum.PROJECT}/upload`, data, ContentTypeEnum.FORM_DATA)
    return res
  } catch {
    httpErrorHandle()
  }
}
