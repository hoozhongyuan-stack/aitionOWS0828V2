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

  // —— 验收/演示夹具(scripts/acceptance.mjs 依赖;同样只补缺失,客户删掉后重跑 seed 会还原)——
  const news = await prisma.category.upsert({
    where: { slug: "news" },
    update: {},
    create: {
      slug: "news",
      moduleType: "article",
      visible: true,
      allowSubmit: false,
      translations: {
        create: [
          { locale: "zh-CN", name: "新闻资讯" },
          { locale: "en", name: "News" },
        ],
      },
    },
  });
  const welcome = await prisma.content.upsert({
    where: { slug: "welcome-aition" },
    update: {},
    create: {
      slug: "welcome-aition",
      categoryId: news.id,
      status: "PUBLISHED",
      source: "ADMIN",
      authorName: "AitionOWS",
      publishAt: new Date(),
      translations: {
        create: [
          {
            locale: "zh-CN",
            title: "欢迎使用 AitionOWS",
            summary: "可售卖、可一键部署、高度自定义的企业官网模板。",
            body: "<h2>核心亮点</h2><p>全站 SSR 与 AI 检索友好、后台可视化配置保存即生效、UGC 先审后发、内置备份与本地存储。</p>",
            seoTitle: "欢迎使用 AitionOWS",
          },
          {
            locale: "en",
            title: "Welcome to AitionOWS",
            summary: "A sellable, one-click deployable, highly customizable corporate website template.",
            body: "<h2>Highlights</h2><p>Full SSR, visual admin with instant effect, moderated UGC, built-in backup and local storage.</p>",
            seoTitle: "Welcome to AitionOWS",
          },
        ],
      },
    },
  });
  await prisma.form.upsert({
    where: { slug: "contact-form" },
    update: {},
    create: {
      slug: "contact-form",
      name: "在线咨询",
      relatedKey: "contact",
      enabled: true,
      antiDuplicate: true,
      schema: JSON.stringify([
        { id: "f_name", type: "text", label: "姓名", required: true, placeholder: "您的称呼" },
        {
          id: "f_phone",
          type: "text",
          label: "联系电话",
          required: true,
          placeholder: "手机号码",
          pattern: "^1[3-9]\\d{9}$",
          patternMsg: "手机号格式不正确",
        },
        { id: "f_need", type: "select", label: "咨询类型", required: true, options: ["产品咨询", "技术支持", "合作洽谈"] },
        { id: "f_msg", type: "textarea", label: "留言内容", required: false, placeholder: "想咨询的内容" },
      ]),
    },
  });
  const agreements: { type: string; locale: string; title: string; body: string }[] = [
    {
      type: "REGISTER",
      locale: "zh-CN",
      title: "用户注册协议",
      body: "<p>注册即表示同意本站服务条款:合法使用本站服务,不得发布违法违规内容。</p>",
    },
    {
      type: "PRIVACY",
      locale: "zh-CN",
      title: "用户隐私政策",
      body: "<p>我们仅收集提供服务所必需的信息,不会向第三方出售您的个人数据。</p>",
    },
    {
      type: "REGISTER",
      locale: "en",
      title: "Terms of Service",
      body: "<p>By registering you agree to use this site lawfully and respectfully.</p>",
    },
    {
      type: "PRIVACY",
      locale: "en",
      title: "Privacy Policy",
      body: "<p>We only collect what is necessary to provide the service and never sell your data.</p>",
    },
  ];
  for (const a of agreements) {
    await prisma.agreement.upsert({ where: { type_locale: { type: a.type, locale: a.locale } }, update: {}, create: a });
  }
  void welcome;

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
