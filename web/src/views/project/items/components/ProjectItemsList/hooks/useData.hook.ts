import { ref, reactive, computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import { goDialog, httpErrorHandle, previewPath, getStoredRole } from '@/utils'
import { DialogEnum } from '@/enums/pluginEnum'
import {
  projectListApi,
  deleteProjectApi,
  changeProjectReleaseApi,
  copyProjectApi,
  updateProjectApi,
  sortProjectApi,
  setProjectTemplateApi
} from '@/api/path'
import { Chartype, ChartList } from '../../../index.d'
import { ResultEnum } from '@/enums/httpEnum'
import { useTeamOptions } from '@/hooks'

export type ProjectScopeFilter = 'mine' | 'team' | 'all'

// 数据初始化
export const useDataListInit = () => {
  const loading = ref(true)
  const { copy, isSupported } = useClipboard({ legacy: true })
  const { teams, fetchTeams } = useTeamOptions()

  const scope = ref<ProjectScopeFilter>('mine')
  const teamId = ref<string | null>(null)
  const isAdmin = getStoredRole() === 'admin'
  const teamOptions = computed(() =>
    teams.value.map(team => ({ label: team.name, value: team.id }))
  )

  const paginat = reactive({
    // 当前页数
    page: 1,
    // 每页值
    limit: 12,
    // 总数
    count: 0
  })

  const list = ref<ChartList>([])
  const sortBackup = ref<ChartList>([])

  // 数据请求
  const fetchList = async () => {
    if (scope.value === 'team' && !teamId.value) {
      list.value = []
      paginat.count = 0
      loading.value = false
      return
    }
    loading.value = true
    try {
      const res = await projectListApi({
        page: paginat.page,
        limit: paginat.limit,
        scope: scope.value,
        ...(scope.value === 'team' ? { teamId: teamId.value } : {})
      })
      if (res && res.data) {
        paginat.count = res.count || 0
        list.value = res.data.map(e => {
          const {
            id,
            projectName,
            state,
            createTime,
            updateTime,
            indexImage,
            createUserId,
            createUserName,
            teamId: itemTeamId,
            teamName,
            isTemplate,
            templateCategory,
            version,
            updateUserName
          } = e
          return {
            id,
            title: projectName,
            createId: createUserId,
            createUserName,
            time: updateTime || createTime,
            image: indexImage,
            release: state !== -1,
            teamId: itemTeamId || '',
            teamName: teamName || '',
            isTemplate: !!isTemplate,
            templateCategory: templateCategory || '',
            version: version ?? 0,
            updateUserName: updateUserName || createUserName
          }
        })
        return
      }
      httpErrorHandle()
    } finally {
      loading.value = false
    }
  }

  const changeScope = (value: ProjectScopeFilter) => {
    scope.value = value
    paginat.page = 1
    fetchList()
  }

  const changeTeam = (value: string | null) => {
    teamId.value = value
    paginat.page = 1
    fetchList()
  }

  // 修改页数
  const changePage = (_page: number) => {
    paginat.page = _page
    fetchList()
  }

  // 修改大小
  const changeSize = (_size: number) => {
    paginat.limit = _size
    fetchList()
  }

  // 删除处理
  const deleteHandle = (cardData: Chartype) => {
    goDialog({
      type: DialogEnum.DELETE,
      promise: true,
      onPositiveCallback: () =>
        new Promise(res => {
          res(
            deleteProjectApi({
              ids: cardData.id
            })
          )
        }),
      promiseResCallback: (res: any) => {
        if (res.code === ResultEnum.SUCCESS) {
          window['$message'].success(window['$t']('global.r_delete_success'))
          fetchList()
          return
        }
        httpErrorHandle()
      }
    })
  }

  // 发布处理
  const releaseHandle = async (cardData: Chartype) => {
    const { id, release } = cardData
    const res = await changeProjectReleaseApi({
      id,
      // [-1未发布, 1发布]
      state: !release ? 1 : -1
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      await fetchList()
      // 发布 -> 未发布
      if (release) {
        window['$message'].success(window['$t']('global.r_unpublish_success'))
        return
      }
      // 未发布 -> 发布
      if (isSupported.value) {
        await copy(previewPath(id))
        window['$message'].success('发布成功，预览链接已复制到剪贴板')
      } else {
        window['$message'].success('发布成功，请手动复制预览链接')
      }
      return
    }
    httpErrorHandle()
  }

  // 复制项目
  const copyHandle = async (cardData: Chartype) => {
    const res = await copyProjectApi({ id: cardData.id })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success(window['$t']('global.r_copy_success'))
      fetchList()
      return
    }
    httpErrorHandle()
  }

  // 重命名
  const renameHandle = async (cardData: Chartype, projectName: string) => {
    const res = await updateProjectApi({ id: cardData.id, projectName })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success(window['$t']('global.r_rename_success'))
      fetchList()
      return true
    }
    httpErrorHandle()
    return false
  }

  // 拖拽排序
  const sortStartHandle = () => {
    sortBackup.value = [...list.value]
  }

  const sortEndHandle = async () => {
    const ids = list.value.map(item => item.id)
    const res = await sortProjectApi({ ids })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success('排序已保存')
      return
    }
    list.value = sortBackup.value
    window['$message'].error('排序保存失败，已恢复原顺序')
  }

  // 设为模板 / 取消模板
  const setTemplateHandle = async (
    cardData: Chartype,
    isTemplate: boolean,
    templateCategory?: string
  ) => {
    const res = await setProjectTemplateApi({
      id: cardData.id,
      isTemplate,
      ...(templateCategory ? { templateCategory } : {})
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success(isTemplate ? '已设为模板' : '已取消模板')
      await fetchList()
      return true
    }
    httpErrorHandle()
    return false
  }

  // 立即请求
  fetchList()
  fetchTeams()

  return {
    loading,
    paginat,
    list,
    scope,
    teamId,
    isAdmin,
    teamOptions,
    fetchList,
    releaseHandle,
    copyHandle,
    renameHandle,
    setTemplateHandle,
    sortStartHandle,
    sortEndHandle,
    changeSize,
    changePage,
    changeScope,
    changeTeam,
    deleteHandle
  }
}
