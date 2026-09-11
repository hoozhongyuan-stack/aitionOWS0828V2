/**
 * 版本信息(V4.4.0):供后台登录页与侧边栏展示。
 *
 * 值由 next.config.ts 在**构建时**注入(见其 env 段):
 *  - APP_VERSION ← package.json 的 version(发版改版本号即同步);
 *  - BUILD_TIME  ← 构建那一刻,每次 docker build 自动更新——
 *    它等于「这个包是什么时候部署上线的」,排查问题时最有用。
 * 两个值都带 NEXT_PUBLIC_ 前缀,已内联进客户端 bundle,客户端组件可直接读。
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
export const BUILD_TIME_ISO = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

/**
 * 构建时间的可读文案(固定按北京时间显示,不受访问者本地时区影响)。
 * 用 UTC+8 手工换算而非 Intl timeZone,避免依赖运行环境的时区数据库。
 * 无值(本地未走构建注入)时返回空串,调用方据此隐藏。
 */
export function buildTimeLabel(): string {
  if (!BUILD_TIME_ISO) return "";
  const d = new Date(BUILD_TIME_ISO);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`;
}

/** 一行式版本文案(登录页用):`v4.4.0 · 构建于 2026-09-11 15:20` */
export function versionLine(): string {
  const t = buildTimeLabel();
  return t ? `v${APP_VERSION} · 构建于 ${t}` : `v${APP_VERSION}`;
}
