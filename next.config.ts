import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl 插件:指向多语言请求配置文件
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // 部署策略:不用 standalone —— 容器启动需运行 prisma migrate/seed(依赖完整
  // node_modules),standalone 的裁剪收益无法兑现,反而与 `next start` 冲突。
  // 镜像取向:可靠性优先,保留完整依赖,用 `next start` 启动(见 docker/)。
  // 本地上传资源通过应用路由代理输出,无需外部图片域名
  images: {
    // 如需允许远程图片域名可在此追加;本项目资源均本地存储
    remotePatterns: [],
  },
  eslint: {
    // 构建时 lint 错误会阻断构建(质量门禁;如需放开可改为 true)
    ignoreDuringBuilds: false,
  },
  // 站点级安全响应头(此前仅 /uploads 文件路由有自己的 CSP sandbox):
  // - 不启用完整 CSP:Next SSR 注水与主题 <style> 注入依赖内联,CSP 需要 nonce 体系,
  //   属破坏性变更;此处先落无副作用的基线头。
  // - HSTS 在纯 HTTP 内网链路上会被浏览器忽略,经 Caddy 反代的 HTTPS 用户则正常生效。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
