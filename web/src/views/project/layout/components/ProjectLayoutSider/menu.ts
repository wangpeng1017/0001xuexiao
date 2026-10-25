import { reactive, h } from 'vue'
import { renderIcon } from '@/utils'
import { RouterLink } from 'vue-router'
import { PageEnum } from '@/enums/pageEnum'
import { MenuOption, MenuGroupOption } from 'naive-ui'
import { icon } from '@/plugins'
import { useSystemStore } from '@/store/modules/systemStore/systemStore'
import { RoleEnum } from '@/enums/roleEnum'

const { TvOutlineIcon, PersonIcon, AlbumsIcon, ConstructIcon, LayersIcon } = icon.ionicons5
const { DevicesIcon } = icon.carbon
const { ChartPieIcon, TableSplitIcon, ObjectStorageIcon, StoreIcon } = icon.carbon
export const renderMenuLabel = (option: MenuOption | MenuGroupOption) => {
  return option.label
}

export const expandedKeys = () => ['all-project']

export const menuOptionsInit = () => {
  const t = window['$t']
  const systemStore = useSystemStore()
  const role = systemStore.getUserInfo.role
  const isAdmin = role === RoleEnum.ADMIN
  const isTeacher = role === RoleEnum.TEACHER

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
        },
        {
          label: () =>
            h(
              RouterLink,
              {
                to: {
                  name: PageEnum.BASE_HOME_TEMPLATE_LIBRARY_NAME
                }
              },
              { default: () => '模板库' }
            ),
          key: PageEnum.BASE_HOME_TEMPLATE_LIBRARY_NAME,
          icon: renderIcon(AlbumsIcon)
        }
      ]
    },
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

  menu.push(
    {
      key: 'divider-m4',
      type: 'divider'
    },
    {
      label: () => h('span', null, { default: () => '协作与素材' }),
      key: 'collaboration',
      icon: renderIcon(LayersIcon),
      children: [
        ...(isAdmin || isTeacher
          ? [
              {
                label: () =>
                  h(
                    RouterLink,
                    {
                      to: {
                        name: PageEnum.BASE_HOME_TEAM_NAME
                      }
                    },
                    { default: () => '团队管理' }
                  ),
                key: PageEnum.BASE_HOME_TEAM_NAME,
                icon: renderIcon(ConstructIcon)
              }
            ]
          : []),
        {
          label: () =>
            h(
              RouterLink,
              {
                to: {
                  name: PageEnum.BASE_HOME_MATERIAL_NAME
                }
              },
              { default: () => '素材库' }
            ),
          key: PageEnum.BASE_HOME_MATERIAL_NAME,
          icon: renderIcon(AlbumsIcon)
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
