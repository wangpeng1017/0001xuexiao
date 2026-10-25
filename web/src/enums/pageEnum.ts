import { ResultEnum } from '@/enums/httpEnum'

export enum ChartEnum {
  // 图表创建
  CHART_HOME = '/chart/home/:id(.*)*',
  CHART_HOME_NAME = 'ChartHome',
}

export enum PreviewEnum {
  //  图表预览
  CHART_PREVIEW = '/chart/preview/:id(.*)*',
  CHART_PREVIEW_NAME = 'ChartPreview',
}

export enum EditEnum {
  //  图表JSON编辑
  CHART_EDIT = '/chart/edit/:id(.*)*',
  CHART_EDIT_NAME = 'ChartEdit',
}

export enum PageEnum {
  // 登录
  BASE_LOGIN = '/login',
  BASE_LOGIN_NAME = 'Login',

  //重定向
  REDIRECT = '/redirect',
  REDIRECT_NAME = 'Redirect',

  // 未发布
  REDIRECT_UN_PUBLISH = '/redirect/unPublish',
  REDIRECT_UN_PUBLISH_NAME = 'redirect-un-publish',

  // 重载
  RELOAD = '/reload',
  RELOAD_NAME = 'Reload',

  // 首页
  BASE_HOME = '/project',
  BASE_HOME_NAME = 'Project',

  // 我的项目
  BASE_HOME_ITEMS = '/project/items',
  BASE_HOME_ITEMS_NAME = 'Project-Items',

  // 我的模板
  BASE_HOME_TEMPLATE = '/project/my-template',
  BASE_HOME_TEMPLATE_NAME = 'Project-My-Template',

  // 模板市场
  BASE_HOME_TEMPLATE_MARKET = '/project/template-market',
  BASE_HOME_TEMPLATE_MARKET_NAME = 'Project-Template-Market',

  // 用户管理（仅管理员）
  BASE_HOME_USER = '/project/user',
  BASE_HOME_USER_NAME = 'Project-User',

  // 数据集
  BASE_HOME_DATASET = '/project/dataset',
  BASE_HOME_DATASET_NAME = 'Project-Dataset',

  // 数据文件
  BASE_HOME_DATAFILE = '/project/datafile',
  BASE_HOME_DATAFILE_NAME = 'Project-Datafile',

  // 支持格式
  BASE_HOME_FORMATS = '/project/formats',
  BASE_HOME_FORMATS_NAME = 'Project-Formats',

  // 修改密码
  CHANGE_PASSWORD = '/change-password',
  CHANGE_PASSWORD_NAME = 'ChangePassword',

  // 错误
  ERROR_PAGE_NAME_403 = 'ErrorPage403',
  ERROR_PAGE_NAME_404 = 'ErrorPage404',
  ERROR_PAGE_NAME_500 = 'ErrorPage500'
}

export const ErrorPageNameMap = new Map([
  [ResultEnum.NOT_FOUND, PageEnum.ERROR_PAGE_NAME_404],
  [ResultEnum.SERVER_FORBIDDEN, PageEnum.ERROR_PAGE_NAME_403],
  [ResultEnum.SERVER_ERROR, PageEnum.ERROR_PAGE_NAME_500]
])
