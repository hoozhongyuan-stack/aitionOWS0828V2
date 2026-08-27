/**
 * 数据库种子:首次部署自动初始化。
 * 内容:默认管理员、默认语言、默认主题/品牌/功能开关配置、基础敏感词。
 * 幂等:全部使用 upsert,可重复执行不产生重复数据。
 *
 * 默认管理员账号:admin / admin888(生产首次登录后请立即修改)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// —— 默认主题(shadcn slate 基调;hex 格式供后台调色板直接编辑)——
const DEFAULT_THEME = {
  primary: "#0f172a",
  secondary: "#f1f5f9",
  background: "#ffffff",
  foreground: "#020817",
  radius: "0.5rem",
  fontSans: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontHeading: "",
  fontSize: "16px",
  lineHeight: "1.6",
};

// —— 默认品牌信息 ——
const DEFAULT_BRAND = {
  siteName: "AitionOWS",
  logoUrl: "",
  faviconUrl: "",
  icp: "",
  copyright: "© " + new Date().getFullYear() + " AitionOWS. All rights reserved.",
  contactPhone: "",
  contactEmail: "",
  contactAddress: "",
  socials: [],
  maintenance: false,
  maintenanceText: "网站维护中,请稍后访问。",
};

// —— UGC / 互动 功能总开关 ——
const DEFAULT_FEATURES = {
  like: true,
  share: true,
  comment: true,
  commentLoginRequired: true,
  submission: false, // 用户投稿默认关闭
  forceLogin: false, // 游客可浏览
};

// —— 文件上传限制(含 ICO:favicon 场景;两种 mime 为不同浏览器上报差异)——
const DEFAULT_UPLOAD = {
  maxSizeMB: 10,
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "video/mp4",
  ],
  maxCount: 20,
};

// —— GEO / SEO 默认 ——
const DEFAULT_SEO = {
  city: "",
  address: "",
  lat: "",
  lng: "",
  serviceArea: "",
  geoKeywords: "",
  allowIndex: true,
  extraDisallow: "",
};

// —— 错误页文案 ——
const DEFAULT_ERRORS = {
  notFoundTitle: "404",
  notFoundDesc: "页面不存在或已被移除",
  errorTitle: "500",
  errorDesc: "服务出错了,请稍后重试",
};

// —— 安全 ——
const DEFAULT_SECURITY = {
  defaultPwChanged: false, // 默认管理员密码是否已修改(P9 强制改密用)
};

// —— 微信登录(一期仅 PC 扫码;预留 H5 字段)——
const DEFAULT_WECHAT = {
  enabled: false,
  appId: "",
  appSecret: "",
  h5AppId: "", // 预留,一期不实现
  h5AppSecret: "", // 预留,一期不实现
};

/**
 * 写入一组配置到 Setting 表。
 * 重要:update 分支必须为空对象 —— seed 在每次容器启动都会执行,
 *       若覆盖已有值,客户在后台的所有配置会在重启后被重置(生产事故)。
 *       因此语义是"只补缺失项,绝不覆盖已有项"。
 */
async function upsertSettings(group: string, obj: Record<string, unknown>) {
  for (const [key, value] of Object.entries(obj)) {
    await prisma.setting.upsert({
      where: { group_key: { group, key } },
      update: {}, // 已存在 → 不动
      create: { group, key, value: JSON.stringify(value) },
    });
  }
}

async function main() {
  // 启用 SQLite WAL(持久化设置,写一次即落库;与 src/lib/db.ts 双保险)
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");

  // 默认语言:简体中文(默认)+ 英文
  await prisma.locale.upsert({
    where: { code: "zh-CN" },
    update: {},
    create: { code: "zh-CN", name: "简体中文", isDefault: true, enabled: true, sort: 0 },
  });
  await prisma.locale.upsert({
    where: { code: "en" },
    update: {},
    create: { code: "en", name: "English", isDefault: false, enabled: true, sort: 1 },
  });

  // 默认管理员
  const passwordHash = await bcrypt.hash("admin888", 10);
  await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash, displayName: "超级管理员", role: "admin" },
  });

  // 默认配置分组
  await upsertSettings("theme", DEFAULT_THEME);
  await upsertSettings("brand", DEFAULT_BRAND);
  await upsertSettings("features", DEFAULT_FEATURES);
  await upsertSettings("upload", DEFAULT_UPLOAD);
  await upsertSettings("seo", DEFAULT_SEO);
  await upsertSettings("wechat", DEFAULT_WECHAT);
  await upsertSettings("errors", DEFAULT_ERRORS);
  await upsertSettings("security", DEFAULT_SECURITY);

  // 基础敏感词(示例,客户可后台增删)
  const words = ["敏感词示例", "违禁词示例"];
  for (const word of words) {
    await prisma.sensitiveWord.upsert({
      where: { word },
      update: {},
      create: { word },
    });
  }

  console.log("✔ 种子数据初始化完成(默认管理员 admin / admin888)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
