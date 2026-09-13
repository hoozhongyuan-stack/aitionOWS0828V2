/**
 * 数据库种子:首次部署自动初始化。
 * 内容:默认管理员、默认语言、默认主题/品牌/功能开关配置、基础敏感词。
 * 幂等:全部使用 upsert,可重复执行不产生重复数据。
 * 演示夹具例外(V4.6.6):只在首次初始化播种,存量站点重启不会补回被删的演示内容——
 * 判据见 src/server/seed/demo-guard.ts;需要全新部署不带演示数据时设 SEED_DEMO=0。
 *
 * 默认管理员账号:admin / admin888(生产首次登录后请立即修改)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { decideDemoSeed, DEMO_SEED_MARKER } from "../src/server/seed/demo-guard";

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

/**
 * 演示夹具(news 栏目 + 欢迎内容 + 在线咨询表单 + 「产品中心」栏目树 + 演示商品)。
 *
 * ⚠️ 只允许在**首次初始化**时调用一次:这些行是 upsert「只补缺失」,在存量站点上重跑
 *    会把管理员删掉的演示内容种回来(V4.6.5 发布事故)。是否调用由 decideDemoSeed 决定。
 *    新库要预置演示数据 → 保持默认;不需要 → 设 SEED_DEMO=0。
 */
async function seedDemoFixtures() {
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

  // —— V3.0 演示数据(non-normative,可选交付便利项):「产品中心」栏目树 + 演示商品 ——
  // 惯例与上方一致:全部 upsert 且 update 分支为空 → 存在即跳过,绝不覆盖客户在后台的改动。
  const demoImage = (label: string, bg: string) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="50%" fill="#ffffff" font-family="system-ui" font-size="44" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`
    )}`;

  const productRoot = await prisma.category.upsert({
    where: { slug: "products" },
    update: {},
    create: {
      slug: "products",
      moduleType: "product",
      visible: true,
      allowSubmit: false,
      sort: 3,
      translations: {
        create: [
          { locale: "zh-CN", name: "产品中心", description: "演示商品栏目:支持图集、规格参数与询盘表单。" },
          { locale: "en", name: "Products", description: "Demo product catalog: gallery, specs and inquiry form." },
        ],
      },
    },
  });
  const productChildA = await prisma.category.upsert({
    where: { slug: "products-industrial" },
    update: {},
    create: {
      slug: "products-industrial",
      parentId: productRoot.id,
      moduleType: "product",
      visible: true,
      allowSubmit: false,
      sort: 1,
      translations: {
        create: [
          { locale: "zh-CN", name: "工业设备" },
          { locale: "en", name: "Industrial Equipment" },
        ],
      },
    },
  });
  const productChildB = await prisma.category.upsert({
    where: { slug: "products-smart" },
    update: {},
    create: {
      slug: "products-smart",
      parentId: productRoot.id,
      moduleType: "product",
      visible: true,
      allowSubmit: false,
      sort: 2,
      translations: {
        create: [
          { locale: "zh-CN", name: "智能终端" },
          { locale: "en", name: "Smart Devices" },
        ],
      },
    },
  });
  const demoInquiryForm = await prisma.form.upsert({
    where: { slug: "demo-inquiry" },
    update: {},
    create: {
      slug: "demo-inquiry",
      name: "产品询盘",
      relatedKey: "demo-inquiry",
      enabled: true,
      antiDuplicate: true,
      schema: JSON.stringify([
        { id: "f_name", type: "text", label: "姓名", required: true, placeholder: "您的称呼" },
        { id: "f_phone", type: "text", label: "联系电话", required: true, placeholder: "手机号码" },
        { id: "f_msg", type: "textarea", label: "询盘内容", required: false, placeholder: "感兴趣的产品与需求" },
      ]),
    },
  });
  const demoProducts: {
    slug: string;
    categoryId: number;
    model: string;
    zhTitle: string;
    enTitle: string;
  }[] = [
    {
      slug: "demo-product-gateway",
      categoryId: productChildA.id,
      model: "AX-100",
      zhTitle: "演示商品:工业智能网关",
      enTitle: "Demo Product: Industrial Smart Gateway",
    },
    {
      slug: "demo-product-terminal",
      categoryId: productChildB.id,
      model: "ST-200",
      zhTitle: "演示商品:触控智能终端",
      enTitle: "Demo Product: Touch Smart Terminal",
    },
  ];
  for (const p of demoProducts) {
    await prisma.content.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        categoryId: p.categoryId,
        status: "PUBLISHED",
        source: "ADMIN",
        authorName: "AitionOWS",
        publishAt: new Date(),
        coverUrl: demoImage("Demo 1", "#0f172a"),
        gallery: JSON.stringify([demoImage("Demo 1", "#0f172a"), demoImage("Demo 2", "#334155")]),
        specs: JSON.stringify([
          { k: "型号", v: p.model },
          { k: "材质", v: "铝合金机身" },
          { k: "质保", v: "整机 24 个月" },
        ]),
        formId: demoInquiryForm.id,
        translations: {
          create: [
            {
              locale: "zh-CN",
              title: p.zhTitle,
              summary: "演示商品:含双图图集、三行规格参数与询盘表单,可在后台替换。",
              body: "<h2>产品概述</h2><p>这是随系统预置的演示商品,用于展示商品图集、规格参数与询盘表单能力;可在后台内容管理中编辑或删除。</p>",
              seoTitle: p.zhTitle,
            },
            {
              locale: "en",
              title: p.enTitle,
              summary: "Demo product with gallery, specs and inquiry form; edit or remove in admin.",
              body: "<h2>Overview</h2><p>This is a demo product seeded with the system to showcase gallery, specs and inquiry form; edit or remove it in the admin panel.</p>",
              seoTitle: p.enTitle,
            },
          ],
        },
      },
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

  // —— 演示数据:仅首次初始化时播种(判据见 src/server/seed/demo-guard.ts)——
  const demo = decideDemoSeed({
    hasContent: (await prisma.content.count()) > 0,
    hasCategory: (await prisma.category.count()) > 0,
    hasForm: (await prisma.form.count()) > 0,
    markerExists:
      (await prisma.setting.findUnique({
        where: { group_key: { group: DEMO_SEED_MARKER.group, key: DEMO_SEED_MARKER.key } },
      })) !== null,
    disabled: process.env.SEED_DEMO === "0",
  });
  if (demo.run) {
    await seedDemoFixtures();
    console.log("==> 演示数据已播种(首次初始化)");
  } else {
    console.log(`==> 跳过演示数据:${demo.reason}`);
  }
  if (demo.markInitialized) {
    // 一次性标记:自此之后任何重启/发版都不再播种,即使管理员清空了全部内容
    await prisma.setting.upsert({
      where: { group_key: { group: DEMO_SEED_MARKER.group, key: DEMO_SEED_MARKER.key } },
      update: {},
      create: {
        group: DEMO_SEED_MARKER.group,
        key: DEMO_SEED_MARKER.key,
        value: JSON.stringify({
          seeded: demo.run,
          at: new Date().toISOString(),
        }),
      },
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
