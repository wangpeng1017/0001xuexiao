import { onUnmounted } from 'vue';
import html2canvas from 'html2canvas'
import dayjs from 'dayjs'
import { getUUID, httpErrorHandle, fetchRouteParamsLocation, base64toFile, JSONStringify, JSONParse } from '@/utils'
import { useChartEditStore } from '@/store/modules/chartEditStore/chartEditStore'
import { EditCanvasTypeEnum,
  ChartEditStoreEnum, ProjectInfoEnum,
  ChartEditStorage,
  EditCanvasConfigEnum
} from '@/store/modules/chartEditStore/chartEditStore.d'
import { useChartHistoryStore } from '@/store/modules/chartHistoryStore/chartHistoryStore'
import { StylesSetting } from '@/components/Pages/ChartItemSetting'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { useChartLayoutStore } from '@/store/modules/chartLayoutStore/chartLayoutStore'
import { ChartLayoutStoreEnum } from '@/store/modules/chartLayoutStore/chartLayoutStore.d'
import { fetchChartComponent, fetchConfigComponent, createComponent } from '@/packages/index'
import { saveInterval } from '@/settings/designSetting'
import throttle from 'lodash/throttle'
// 接口状态
import { ResultEnum } from '@/enums/httpEnum'
// 接口
import { saveProjectApi, fetchProjectApi, uploadFile, updateProjectApi } from '@/api/path'
// 画布枚举
import { SyncEnum } from '@/enums/editPageEnum'
import { canvasVersionUpdatePolyfill, componentMerge } from './chartMerge'
import { CreateComponentType, CreateComponentGroupType, ConfigType } from '@/packages/index.d'
import { PublicGroupConfigClass } from '@/packages/public/publicConfig'

// 乐观锁：编辑器内多个 useSync 实例共享同一份版本状态
let projectVersion = 0
let conflictPaused = false
let conflictDialogVisible = false

// 请求处理
export const useSync = () => {
  const chartEditStore = useChartEditStore()
  const chartHistoryStore = useChartHistoryStore()
  const systemStore = useSystemStore()
  const chartLayoutStore = useChartLayoutStore()
  /**
   * * 组件动态注册
   * @param projectData 项目数据
   * @param isReplace 是否替换数据
   * @returns
   */
  const updateComponent = async (projectData: ChartEditStorage, isReplace = false, changeId = false) => {
    if (isReplace) {
      // 清除列表
      chartEditStore.componentList = []
      // 清除历史记录
      chartHistoryStore.clearBackStack()
      chartHistoryStore.clearForwardStack()
    }
    // 画布补丁处理
    projectData.editCanvasConfig = canvasVersionUpdatePolyfill(projectData.editCanvasConfig)

    if (projectData.editCanvasConfig[EditCanvasConfigEnum.WIDTH]) {
      chartEditStore.setEditCanvasConfig(
        EditCanvasConfigEnum.WIDTH,
        projectData.editCanvasConfig[EditCanvasConfigEnum.WIDTH]
      )
    }

    if (projectData.editCanvasConfig[EditCanvasConfigEnum.HEIGHT]) {
      chartEditStore.setEditCanvasConfig(
        EditCanvasConfigEnum.HEIGHT,
        projectData.editCanvasConfig[EditCanvasConfigEnum.HEIGHT]
      )
    }
    chartEditStore.computedScale()
    // 列表组件注册
    projectData.componentList.forEach(async (e: CreateComponentType | CreateComponentGroupType) => {
      const intComponent = (target: CreateComponentType) => {
        if (!window['$vue'].component(target.chartConfig.chartKey)) {
          window['$vue'].component(target.chartConfig.chartKey, fetchChartComponent(target.chartConfig))
          window['$vue'].component(target.chartConfig.conKey, fetchConfigComponent(target.chartConfig))
        }
      }

      if (e.isGroup) {
        (e as CreateComponentGroupType).groupList.forEach(groupItem => {
          intComponent(groupItem)
        })
      } else {
        intComponent(e as CreateComponentType)
      }
    })

    // 创建函数-重新创建是为了处理类种方法消失的问题
    const create = async (
      _componentInstance: CreateComponentType,
      callBack?: (componentInstance: CreateComponentType) => void
    ) => {
      // 补充 class 上的方法
      let newComponent: CreateComponentType = await createComponent(_componentInstance.chartConfig)
      if (_componentInstance.chartConfig.redirectComponent) {
        _componentInstance.chartConfig.dataset && (newComponent.option.dataset = _componentInstance.chartConfig.dataset)
        newComponent.chartConfig.title = _componentInstance.chartConfig.title
        newComponent.chartConfig.chartFrame = _componentInstance.chartConfig.chartFrame
      }
      if (callBack) {
        if (changeId) {
          callBack(componentMerge(newComponent, { ..._componentInstance, id: getUUID() }))
        } else {
          callBack(componentMerge(newComponent, _componentInstance))
        }
      } else {
        if (changeId) {
          chartEditStore.addComponentList(
            componentMerge(newComponent, { ..._componentInstance, id: getUUID() }),
            false,
            true
          )
        } else {
          chartEditStore.addComponentList(componentMerge(newComponent, _componentInstance), false, true)
        }
      }
    }

    // 数据赋值
    for (const key in projectData) {
      // 组件
      if (key === ChartEditStoreEnum.COMPONENT_LIST) {
        let loadIndex = 0
        const listLength = projectData[key].length
        for (const comItem of projectData[key]) {
          // 设置加载数量
          let percentage = parseInt((parseFloat(`${++loadIndex / listLength}`) * 100).toString())
          chartLayoutStore.setItemUnHandle(ChartLayoutStoreEnum.PERCENTAGE, percentage)
          // 判断类型
          if (comItem.isGroup) {
            // 创建分组
            let groupClass = new PublicGroupConfigClass()
            if (changeId) {
              groupClass = componentMerge(groupClass, { ...comItem, id: getUUID() })
            } else {
              groupClass = componentMerge(groupClass, comItem)
            }

            // 异步注册子应用
            const targetList: CreateComponentType[] = []
            for (const groupItem of (comItem as CreateComponentGroupType).groupList) {
              await create(groupItem, e => {
                targetList.push(e)
              })
            }
            groupClass.groupList = targetList

            // 分组插入到列表
            chartEditStore.addComponentList(groupClass, false, true)
          } else {
            await create(comItem as CreateComponentType)
          }
          if (percentage === 100) {
            // 清除历史记录
            chartHistoryStore.clearBackStack()
            chartHistoryStore.clearForwardStack()
          }
        }
      } else if (key === ChartEditStoreEnum.EDIT_CANVAS_CONFIG || key === ChartEditStoreEnum.REQUEST_GLOBAL_CONFIG) {
        componentMerge(chartEditStore[key], projectData[key], true)
      }
    }

    // 清除数量
    chartLayoutStore.setItemUnHandle(ChartLayoutStoreEnum.PERCENTAGE, 0)
  }

  /**
   * * 赋值全局数据
   * @param projectData 项目数据
   * @returns
   */
  const updateStoreInfo = (projectData: {
    id: string,
    projectName: string,
    indexImage: string,
    remarks: string,
    state: number
  }) => {
    const { id, projectName, remarks, indexImage, state } = projectData
    // ID
    chartEditStore.setProjectInfo(ProjectInfoEnum.PROJECT_ID, id)
    // 名称
    chartEditStore.setProjectInfo(ProjectInfoEnum.PROJECT_NAME, projectName)
    // 描述
    chartEditStore.setProjectInfo(ProjectInfoEnum.REMARKS, remarks)
    // 缩略图
    chartEditStore.setProjectInfo(ProjectInfoEnum.THUMBNAIL, indexImage)
    // 发布
    chartEditStore.setProjectInfo(ProjectInfoEnum.RELEASE, state === 1)
  }

  // * 数据获取
  const dataSyncFetch = async () => {
    // FIX:重新执行dataSyncFetch需清空chartEditStore.componentList,否则会导致图层重复
    // 切换语言等操作会导致重新执行 dataSyncFetch,此时pinia中并未清空chartEditStore.componentList，导致图层重复
    chartEditStore.componentList = []
    chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.START)
    try {
      const res = await fetchProjectApi({ projectId: fetchRouteParamsLocation() })
      if (res && res.code === ResultEnum.SUCCESS) {
        if (res.data) {
          updateStoreInfo(res.data)
          projectVersion = Number((res.data as { version?: number }).version) || 0
          conflictPaused = false
          // 更新全局数据
          await updateComponent(JSONParse(res.data.content))
          return
        }else {
          chartEditStore.setProjectInfo(ProjectInfoEnum.PROJECT_ID, fetchRouteParamsLocation())
        }
        setTimeout(() => {
          chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.SUCCESS)
        }, 1000)
        return
      }
      chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.FAILURE)
    } catch (error) {
      chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.FAILURE)
      httpErrorHandle()
    }
  }

  const formatConflictTime = (value?: string) => {
    if (!value) return '-'
    const date = dayjs(value)
    return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : value
  }

  const showConflictDialog = (data: {
    updateUserName?: string
    updateTime?: string
    version?: number
  }) => {
    conflictPaused = true
    if (conflictDialogVisible) return
    conflictDialogVisible = true
    window['$dialog'].warning({
      title: '保存冲突',
      content: `该项目已被 ${data.updateUserName || '其他用户'} 于 ${formatConflictTime(data.updateTime)} 修改`,
      positiveText: '覆盖保存',
      negativeText: '重新加载',
      closable: false,
      maskClosable: false,
      onPositiveClick: async () => {
        conflictDialogVisible = false
        conflictPaused = false
        await performSave(false, true)
      },
      onNegativeClick: async () => {
        conflictDialogVisible = false
        conflictPaused = false
        await dataSyncFetch()
        window['$message'].success('已重新加载最新内容')
      }
    })
  }

  const uploadPreviewImage = async (projectId: string, previewFile: File) => {
    try {
      const uploadParams = new FormData()
      uploadParams.append('object', previewFile)
      const uploadRes = await uploadFile(uploadParams)
      if (uploadRes && uploadRes.code === ResultEnum.SUCCESS) {
        if (uploadRes.data.fileurl) {
          await updateProjectApi({ id: projectId, indexImage: `${uploadRes.data.fileurl}` })
        } else {
          await updateProjectApi({
            id: projectId,
            indexImage: `${systemStore.getFetchInfo.OSSUrl}${uploadRes.data.fileName}`
          })
        }
      }
    } catch (e) {
      console.log(e)
    }
  }

  // * 数据保存（带乐观锁）
  const performSave = async (updateImg = true, force = false) => {
    if (!fetchRouteParamsLocation()) return

    const projectId = chartEditStore.getProjectInfo[ProjectInfoEnum.PROJECT_ID]
    if (projectId === null || projectId === '') {
      window['$message'].error('数据初未始化成功,请刷新页面！')
      return
    }

    // 冲突未处理时停止自动保存
    if (conflictPaused && !force) {
      chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.FAILURE)
      return
    }

    chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.START)

    // 先取缩略图，保存成功后再上传，避免冲突时污染修改人信息
    let previewFile: File | null = null
    try {
      if (updateImg) {
        const range = document.querySelector('.go-edit-range') as HTMLElement
        const canvasImage: HTMLCanvasElement = await html2canvas(range, {
          backgroundColor: null,
          allowTaint: true,
          useCORS: true
        })
        previewFile = base64toFile(
          canvasImage.toDataURL(),
          `${fetchRouteParamsLocation()}_index_preview.png`
        )
      }
    } catch (e) {
      console.log(e)
    }

    const params = new FormData()
    params.append('projectId', projectId)
    params.append('content', JSONStringify(chartEditStore.getStorageInfo() || {}))
    params.append('version', String(projectVersion))
    if (force) params.append('force', '1')

    const res = await saveProjectApi(params)

    if (res && res.code === 409) {
      chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.FAILURE)
      showConflictDialog((res.data || {}) as {
        updateUserName?: string
        updateTime?: string
        version?: number
      })
      return
    }

    if (res && res.code === ResultEnum.SUCCESS) {
      const nextVersion = Number((res.data as { version?: number })?.version)
      projectVersion = Number.isFinite(nextVersion) ? nextVersion : projectVersion + 1
      if (force) {
        window['$message'].success('已覆盖保存')
      }
      if (previewFile) {
        await uploadPreviewImage(projectId, previewFile)
      }
      setTimeout(() => {
        chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.SUCCESS)
      }, 1000)
      return
    }

    chartEditStore.setEditCanvas(EditCanvasTypeEnum.SAVE_STATUS, SyncEnum.FAILURE)
  }

  // * 数据保存
  const dataSyncUpdate = throttle((updateImg = true) => performSave(updateImg, false), 3000)

  // * 定时处理
  const intervalDataSyncUpdate = () => {
    // 定时获取数据
    const syncTiming = setInterval(() => {
      dataSyncUpdate()
    }, saveInterval * 1000)

    // 销毁
    onUnmounted(() => {
      clearInterval(syncTiming)
    })
  }

  return {
    updateComponent,
    updateStoreInfo,
    dataSyncFetch,
    dataSyncUpdate,
    intervalDataSyncUpdate
  }
}
