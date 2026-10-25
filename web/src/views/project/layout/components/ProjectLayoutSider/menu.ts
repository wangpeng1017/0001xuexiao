import { reactive, h } from 'vue'
import { renderIcon } from '@/utils'
import { RouterLink } from 'vue-router'
import { PageEnum } from '@/enums/pageEnum'
import { MenuOption, MenuGroupOption } from 'naive-ui'
import { icon } from '@/plugins'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { RoleEnum } from '@/enums/roleEnum'

const { TvOutlineIcon, PersonIcon } = icon.ionicons5
const { DevicesIcon } = icon.carbon
const { ChartPieIcon, TableSplitIcon, ObjectStorageIcon, StoreIcon } = icon.carbon
export const renderMenuLabel = (option: MenuOption | MenuGroupOption) => {
  return option.label
}

export const expandedKeys = () => ['all-project']

export const menuOptionsInit = () => {
  const t = window['$t']
  const systemStore = useSystemStore()
  const isAdmin = systemStore.getUserInfo.role === RoleEnum.ADMIN

  const menu: any[] = [
    {
      key: 'divider-1',
      type: 'divider'
    },
    {
      label: () => h('span', null, { default: () => t('project.project') }),
      key: 'all-project',
      icon: renderIcon(DevicesIcon),
      children: [
        {
          label: () =>
            h(
              RouterLink,
              {
                to: {
                  name: PageEnum.BASE_HOME_ITEMS_NAME
                }
              },
              { default: () => t('project.all_project') }
            ),
          key: PageEnum.BASE_HOME_ITEMS_NAME,
          icon: renderIcon(TvOutlineIcon)
        }
      ]
    }
  ]

  menu.push(
    {
      key: 'divider-data',
      type: 'divider'
    },
    {
      label: () => h('span', null, { default: () => '数据' }),
      key: 'data',
      icon: renderIcon(ChartPieIcon),
      children: [
        {
          label: () =>
            h(
              RouterLink,
              {
                to: {
                  name: PageEnum.BASE_HOME_DATASET_NAME
                }
              },
              { default: () => '数据集' }
            ),
          key: PageEnum.BASE_HOME_DATASET_NAME,
          icon: renderIcon(TableSplitIcon)
        },
        {
          label: () =>
            h(
              RouterLink,
              {
                to: {
                  name: PageEnum.BASE_HOME_DATAFILE_NAME
                }
              },
              { default: () => '数据文件' }
            ),
          key: PageEnum.BASE_HOME_DATAFILE_NAME,
          icon: renderIcon(ObjectStorageIcon)
        },
        {
          label: () =>
            h(
              RouterLink,
              {
                to: {
                  name: PageEnum.BASE_HOME_FORMATS_NAME
                }
              },
              { default: () => '支持格式' }
            ),
          key: PageEnum.BASE_HOME_FORMATS_NAME,
          icon: renderIcon(StoreIcon)
        }
      ]
    }
  )

  if (isAdmin) {
    menu.push(
      {
        key: 'divider-2',
        type: 'divider'
      },
      {
        label: () =>
          h(
            RouterLink,
            {
              to: {
                name: PageEnum.BASE_HOME_USER_NAME
              }
            },
            { default: () => '用户管理' }
          ),
        key: PageEnum.BASE_HOME_USER_NAME,
        icon: renderIcon(PersonIcon)
      }
    )
  }

  return reactive(menu)
}
