import { Router } from 'vue-router';
import { PageEnum, PreviewEnum } from '@/enums/pageEnum'
import { isAdminRole, isMustChangePwd, loginCheck } from '@/utils'

// 路由白名单（无需登录）
const routerAllowList = [
  // 登录
  PageEnum.BASE_LOGIN_NAME,
  // 预览
  PreviewEnum.CHART_PREVIEW_NAME,
  // 未发布提示页
  PageEnum.REDIRECT_UN_PUBLISH_NAME
]

const PLATFORM_TITLE = '多源数据融合可视化平台'

export function createRouterGuards(router: Router) {
  // 前置
  router.beforeEach(async (to, from, next) => {
    // http://localhost:3000/#/chart/preview/792622755697790976?t=123
    // 把外部动态参数放入window.route.params，后续API动态接口可以用window.route?.params?.t来拼接参数
    // @ts-ignore
    if (!window.route) window.route = {params: {}}
    // @ts-ignore
    Object.assign(window.route.params, to.query)

    const Loading = window['$loading'];
    Loading && Loading.start();
    const isErrorPage = router.getRoutes().findIndex((item) => item.name === to.name);
    if (isErrorPage === -1) {
      next({ name: PageEnum.ERROR_PAGE_NAME_404 })
      return
    }

    const loggedIn = loginCheck()
    // @ts-ignore
    const isAllowPage = routerAllowList.includes(to.name)

    // 未登录时只允许访问白名单页面
    if (!loggedIn && !isAllowPage) {
      next({ name: PageEnum.BASE_LOGIN_NAME })
      return
    }

    if (loggedIn) {
      // 已登录时不再进入登录页
      if (to.name === PageEnum.BASE_LOGIN_NAME) {
        next({ name: isMustChangePwd() ? PageEnum.CHANGE_PASSWORD_NAME : PageEnum.BASE_HOME_NAME })
        return
      }
      // 强制修改密码期间只允许 sys/* 相关页面和白名单页面
      if (isMustChangePwd() && !isAllowPage && to.name !== PageEnum.CHANGE_PASSWORD_NAME) {
        next({ name: PageEnum.CHANGE_PASSWORD_NAME })
        return
      }
      // 管理员页面权限
      if (to.meta?.requiresAdmin && !isAdminRole()) {
        next({ name: PageEnum.ERROR_PAGE_NAME_403 })
        return
      }
    }

    next()
  })

  router.afterEach((to) => {
    const Loading = window['$loading'];
    const pageTitle = to?.meta?.title as string
    document.title = pageTitle ? `${pageTitle} - ${PLATFORM_TITLE}` : PLATFORM_TITLE;
    Loading && Loading.finish();
  })

  // 错误
  router.onError((error) => {
    console.log(error, '路由错误');
  });
}