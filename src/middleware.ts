import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse, type NextRequest } from "next/server";
import { getRuntimeFlags } from "@/server/setting";
import { getDefaultLocale } from "@/server/i18n";

/**
 * 全局中间件(Node.js 运行时,Next 15.5 稳定支持):
 *  1) 多语言路由(next-intl)
 *  2) 维护模式:开启时前台全部改写到 /maintenance(后台 /admin 不受影响,便于关闭开关)
 *  3) 强制登录:开启时游客访问前台重定向到 /login
 *
 * 为什么用 Node 运行时(测试反馈"维护模式不生效"的根因修复):
 *  Edge 运行时无法直连数据库,旧实现通过 HTTP 自请求 /api/flags 获取开关。
 *  生产环境(Caddy/HTTPS 反代)下,容器内请求自身公网域名是发夹(hairpin)流量,
 *  云安全组/防火墙常阻断回环,fetch 失败走 fail-open,开关永远不生效。
 *  改为 Node 运行时后直接调用服务层查库,无 HTTP 自请求、无发夹流量、无额外延迟;
 *  多实例部署下各实例都是直读库,开关保存后对所有实例即时生效。
 *  DB 未就绪等异常一律放行(fail-open,不能把站点打挂)。
 */
export const runtime = "nodejs";

const intlMiddleware = createMiddleware(routing);

/** 维护模式/强制登录都不拦截的路径(去掉语言前缀后匹配;忘记/重置密码必须放行,否则用户无法自助找回) */
const EXEMPT_PREFIXES = ["/maintenance", "/login", "/register", "/forgot-password", "/reset-password", "/agreement", "/admin"];

const USER_COOKIE = "aition_user"; // 与 lib/auth/session.ts 保持一致
const ADMIN_COOKIE = "aition_admin";

/** 去掉语言前缀,返回业务路径(/zh-CN/news → /news) */
function stripLocale(pathname: string): string {
  for (const l of routing.locales) {
    if (pathname === `/${l}`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const bizPath = stripLocale(pathname);
  const isExempt = EXEMPT_PREFIXES.some((p) => bizPath === p || bizPath.startsWith(p + "/"));

  if (!isExempt) {
    let flags: { maintenance: boolean; forceLogin: boolean; defaultLocale: string } = {
      maintenance: false,
      forceLogin: false,
      defaultLocale: routing.defaultLocale,
    };
    try {
      const [runtimeFlags, defaultLocale] = await Promise.all([getRuntimeFlags(), getDefaultLocale()]);
      flags = { maintenance: runtimeFlags.maintenance, forceLogin: runtimeFlags.forceLogin, defaultLocale };
    } catch {
      // fail-open(如数据库尚未初始化)
    }

    // 裸域访问:跳转到后台配置的默认语言(运行时可改,优先于 next-intl 静态默认)
    if (pathname === "/") {
      const target =
        routing.locales.includes(flags.defaultLocale as (typeof routing.locales)[number])
          ? flags.defaultLocale
          : routing.defaultLocale;
      return NextResponse.redirect(new URL(`/${target}`, request.url));
    }

    // 维护模式:改写(保持 URL 不变,SEO 友好)到维护页
    if (flags.maintenance) {
      const locale = pathname.split("/")[1];
      const target = routing.locales.includes(locale as (typeof routing.locales)[number])
        ? `/${locale}/maintenance`
        : `/${routing.defaultLocale}/maintenance`;
      return NextResponse.rewrite(new URL(target, request.url));
    }

    // 强制登录:无用户会话 → 跳登录页(带回跳地址)
    if (flags.forceLogin && !request.cookies.get(USER_COOKIE)?.value) {
      const locale = pathname.split("/")[1];
      const prefix = routing.locales.includes(locale as (typeof routing.locales)[number])
        ? `/${locale}`
        : `/${routing.defaultLocale}`;
      const url = new URL(`${prefix}/login`, request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // 后台轻量守卫:无管理员 cookie 直接跳后台登录页(细粒度校验在布局/接口层)
  if (bizPath.startsWith("/admin") && bizPath !== "/admin/login" && !bizPath.startsWith("/admin/login/")) {
    if (!request.cookies.get(ADMIN_COOKIE)?.value) {
      const locale = pathname.split("/")[1];
      const prefix = routing.locales.includes(locale as (typeof routing.locales)[number])
        ? `/${locale}`
        : `/${routing.defaultLocale}`;
      return NextResponse.redirect(new URL(`${prefix}/admin/login`, request.url));
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // 匹配除 api、_next、静态资源、上传目录以外的所有路径
  matcher: ["/((?!api|_next|uploads|.*\\..*).*)"],
};
