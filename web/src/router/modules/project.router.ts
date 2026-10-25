import { RouteRecordRaw } from 'vue-router'
import { PageEnum } from '@/enums/pageEnum'

// 引入路径
const importPath = {
  'PageEnum.BASE_HOME_NAME': () => import('@/views/project/index.vue'),
  'PageEnum.BASE_HOME_ITEMS_NAME': () => import('@/views/project/items/index.vue'),
  'PageEnum.BASE_HOME_TEMPLATE_NAME': () => import('@/views/project/mtTemplate/index.vue'),
  'PageEnum.BASE_HOME_TEMPLATE_MARKET_NAME': () => import('@/views/project/templateMarket/index.vue'),
  'PageEnum.BASE_HOME_USER_NAME': () => import('@/views/user/index.vue'),
  'PageEnum.BASE_HOME_TEMPLATE_LIBRARY_NAME': () => import('@/views/project/template/index.vue'),
  'PageEnum.BASE_HOME_TEAM_NAME': () => import('@/views/team/index.vue'),
  'PageEnum.BASE_HOME_MATERIAL_NAME': () => import('@/views/material/index.vue'),
  'PageEnum.BASE_HOME_DATASET_NAME': () => import('@/views/data/dataset/index.vue'),
  'PageEnum.BASE_HOME_DATAFILE_NAME': () => import('@/views/data/datafile/index.vue'),
  'PageEnum.BASE_HOME_FORMATS_NAME': () => import('@/views/data/formats/index.vue')
}

const projectRoutes: RouteRecordRaw = {
  path: PageEnum.BASE_HOME,
  name: PageEnum.BASE_HOME_NAME,
  component: importPath['PageEnum.BASE_HOME_NAME'],
  redirect: PageEnum.BASE_HOME_ITEMS,
  meta: {
    title: '项目',
    isRoot: true
  },
  children: [
    {
      path: PageEnum.BASE_HOME_ITEMS,
      name: PageEnum.BASE_HOME_ITEMS_NAME,
      component: importPath['PageEnum.BASE_HOME_ITEMS_NAME'],
      meta: {
        title: '我的项目'
      }
    },
    {
      path: PageEnum.BASE_HOME_TEMPLATE,
      name: PageEnum.BASE_HOME_TEMPLATE_NAME,
      component: importPath['PageEnum.BASE_HOME_TEMPLATE_NAME'],
      meta: {
        title: '我的模板'
      }
    },
    {
      path: PageEnum.BASE_HOME_TEMPLATE_MARKET,
      name: PageEnum.BASE_HOME_TEMPLATE_MARKET_NAME,
      component: importPath['PageEnum.BASE_HOME_TEMPLATE_MARKET_NAME'],
      meta: {
        title: '模板市场'
      }
    },
    {
      path: PageEnum.BASE_HOME_USER,
      name: PageEnum.BASE_HOME_USER_NAME,
      component: importPath['PageEnum.BASE_HOME_USER_NAME'],
      meta: {
        title: '用户管理',
        requiresAdmin: true
      }
    },
    {
      path: PageEnum.BASE_HOME_TEMPLATE_LIBRARY,
      name: PageEnum.BASE_HOME_TEMPLATE_LIBRARY_NAME,
      component: importPath['PageEnum.BASE_HOME_TEMPLATE_LIBRARY_NAME'],
      meta: {
        title: '模板库'
      }
    },
    {
      path: PageEnum.BASE_HOME_TEAM,
      name: PageEnum.BASE_HOME_TEAM_NAME,
      component: importPath['PageEnum.BASE_HOME_TEAM_NAME'],
      meta: {
        title: '团队管理'
      }
    },
    {
      path: PageEnum.BASE_HOME_MATERIAL,
      name: PageEnum.BASE_HOME_MATERIAL_NAME,
      component: importPath['PageEnum.BASE_HOME_MATERIAL_NAME'],
      meta: {
        title: '素材库'
      }
    },
    {
      path: PageEnum.BASE_HOME_DATASET,
      name: PageEnum.BASE_HOME_DATASET_NAME,
      component: importPath['PageEnum.BASE_HOME_DATASET_NAME'],
      meta: {
        title: '数据集'
      }
    },
    {
      path: PageEnum.BASE_HOME_DATAFILE,
      name: PageEnum.BASE_HOME_DATAFILE_NAME,
      component: importPath['PageEnum.BASE_HOME_DATAFILE_NAME'],
      meta: {
        title: '数据文件'
      }
    },
    {
      path: PageEnum.BASE_HOME_FORMATS,
      name: PageEnum.BASE_HOME_FORMATS_NAME,
      component: importPath['PageEnum.BASE_HOME_FORMATS_NAME'],
      meta: {
        title: '支持格式'
      }
    }
  ]
}

export default projectRoutes
