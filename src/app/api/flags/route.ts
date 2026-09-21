import { NextResponse } from "next/server";
import { getRuntimeFlags } from "@/server/setting";
import { getShopConfig } from "@/server/shop";
import { getBrandConfig } from "@/lib/config";
import { getDefaultLocale } from "@/server/i18n";
import { routing } from "@/i18n/routing";

/**
 * 轻量站点开关接口。返回:维护模式 / 强制登录 / 运行时默认语言。
 *
 * 历史:middleware 曾(Edge 运行时)经 HTTP 自请求本接口获取开关;
 * 自 Node.js 运行时中间件起改为直读服务层,本接口不再被中间件依赖,
 * 保留用于运维调试/外部探活(如确认开关是否真实写入库)。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [flags, defaultLocale, shop, brand] = await Promise.all([
      getRuntimeFlags(),
      getDefaultLocale(),
      getShopConfig(),
      getBrandConfig(),
    ]);
    return NextResponse.json(
      {
        maintenance: flags.maintenance,
        forceLogin: flags.forceLogin,
        defaultLocale,
        orderingEnabled: shop.orderingEnabled,
        // V4.8.3:后台登录页的客服邮箱(此前写死在页面里,现由品牌配置提供;空则不显示该行)
        supportEmail: brand.supportEmail || "",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    // 数据库尚未初始化等异常:一律放行(fail-open,不能把站点打挂)
    return NextResponse.json({
      maintenance: false,
      forceLogin: false,
      defaultLocale: routing.defaultLocale,
    });
  }
}
