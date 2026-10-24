import { getSessionStorage, fetchRouteParamsLocation, httpErrorHandle, JSONParse } from '@/utils'
import { ResultEnum } from '@/enums/httpEnum'
import { StorageEnum } from '@/enums/storageEnum'
import { ChartEditStorage } from '@/store/modules/chartEditStore/chartEditStore.d'
import { fetchProjectApi } from '@/api/path'
import { useChartEditStore } from '@/store/modules/chartEditStore/chartEditStore'

const chartEditStore = useChartEditStore()

export interface ChartEditStorageType extends ChartEditStorage {
  id: string
}

// 根据路由 id 获取存储数据的信息
export const getSessionStorageInfo = async () => {
  const id = fetchRouteParamsLocation()
  const storageList: ChartEditStorageType[] = getSessionStorage(StorageEnum.GO_CHART_STORAGE_LIST)

  // 是否本地预览
  if (!storageList || storageList.findIndex(e => e.id === id.toString()) === -1) {
    // 接口调用
    const res = await fetchProjectApi({ projectId: id })
    if (res && res.code === ResultEnum.SUCCESS) {
      const { content, state } = res.data
      // 匿名访问未发布项目时后端不返回内容，跳转未发布页；
      // 创建者/管理员预览未发布项目时后端会返回完整内容，仍可正常预览
      if (!content || (state === -1 && !content)) {
        return { isRelease: false }
      }
      try {
        const parseData = { ...JSONParse(content), id }
        const { editCanvasConfig, requestGlobalConfig, componentList } = parseData
        chartEditStore.editCanvasConfig = editCanvasConfig
        chartEditStore.requestGlobalConfig = requestGlobalConfig
        chartEditStore.componentList = componentList
        return parseData
      } catch (error) {
        console.log(error)
        return { isRelease: false }
      }
    } else {
      httpErrorHandle()
      return { isRelease: false }
    }
  } else {
    // 本地读取
    for (let i = 0; i < storageList.length; i++) {
      if (id.toString() === storageList[i]['id']) {
        const { editCanvasConfig, requestGlobalConfig, componentList } = storageList[i]
        chartEditStore.editCanvasConfig = editCanvasConfig
        chartEditStore.requestGlobalConfig = requestGlobalConfig
        chartEditStore.componentList = componentList
        return storageList[i]
      }
    }
  }
}
