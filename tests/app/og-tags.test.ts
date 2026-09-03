import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DB_URL } from "../setup/db";

/**
 * TEST-202(AC-004 / REQ-003)+ TEST-203(AC-005 / REQ-004):分享 OG 集成——
 * vitest 内 spawn `next dev`(随机端口,DATABASE_URL 指向全局临时测试库,
 * 与 tests/app/product-page.test.ts 同一套集成模式)。
 *
 * TEST-202:首页/栏目页(有内容的栏目)/联系页 head 含 og:title/og:description/og:image,
 *          且 image 为 http 绝对 URL;无封面栏目 og:image=品牌 LOGO 绝对 URL;
 *          栏目页不存在 slug(404 分支)不要求 OG(仅断言 404,不锁 OG 输出)。
 * TEST-203:文章/商品详情 og 存在且图片绝对 URL(回归锁):
 *          商品 og:image=图集首图;无封面文章 og:image=LOGO 绝对 URL。
 */

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const PORT = 30000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
// .env.example 约定 NEXT_PUBLIC_SITE_URL=http://localhost:3000(本地 dev 同值),
// og:image 绝对化的期望前缀
const SITE = "http://localhost:3000";

const LOGO = "/uploads/og-logo.webp";
const LOGO_ABS = `${SITE}${LOGO}`;
const BANNER = "/uploads/og-banner.webp";
const COVER = "/uploads/og-cover.webp";
const GALLERY_1 = "/uploads/og-g1.webp";

// —— seed 唯一前缀(测试库按 vitest 进程隔离,仍防同文件内重复) ——
const HOME_SEO = { title: "OG集成首页SEO标题", description: "OG集成首页SEO描述" };
const CONTACT_SEO = { title: "OG集成联系SEO标题", description: "OG集成联系SEO描述" };
const CAT_SLUG = "og-cat";
const BARE_CAT_SLUG = "og-bare-cat";
const PRODUCT_CAT_SLUG = "og-prod-cat";
const ARTICLE_SLUG = "og-article-covered";
const BARE_ARTICLE_SLUG = "og-article-nocover";
const PRODUCT_SLUG = "og-product";

let prisma: typeof import("@/lib/db")["prisma"];
let child: ReturnType<typeof spawn> | null = null;
let lastError: unknown = null;
// next dev 会向 tsconfig.json 自动追加自定义 distDir 的 types include,
// 快照后在 afterAll 还原,保持仓库工作区干净
let tsconfigSnapshot: string | null = null;

/** 滚动捕获子进程输出尾部,失败时用于诊断 */
function tail(buf: () => string, n = 3000): string {
  const s = buf();
  return s.length > n ? `…${s.slice(-n)}` : s;
}

/** 从 HTML head 提取 <meta property="..." content="...">(容忍属性顺序差异) */
function metaContent(html: string, property: string): string | null {
  const byPropertyFirst = html.match(
    new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]*)"`)
  );
  if (byPropertyFirst) return byPropertyFirst[1];
  const byContentFirst = html.match(
    new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${property}"`)
  );
  return byContentFirst?.[1] ?? null;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  tsconfigSnapshot = readFileSync(path.join(PROJECT_ROOT, "tsconfig.json"), "utf8");

  // 品牌 LOGO(og:image 兜底链末端):group=brand 的 logoUrl 键(JSON 序列化存储)
  await prisma.setting.create({
    data: { group: "brand", key: "logoUrl", value: JSON.stringify(LOGO) },
  });
  // 固定页 TDK:首页 / 联系页(zh-CN)
  await prisma.seoMeta.createMany({
    data: [
      { pageKey: "home", locale: "zh-CN", ...HOME_SEO, keywords: "" },
      { pageKey: "contact", locale: "zh-CN", ...CONTACT_SEO, keywords: "" },
    ],
  });
  // 首页启用中的轮播图(og:image=首条 Banner)
  await prisma.banner.create({
    data: { imageUrl: BANNER, linkUrl: null, sort: 0, enabled: true },
  });

  // 栏目一:有内容(两条 PUBLISHED,首条有封面)→ og:image=首条封面(publishAt desc)
  const cat = await prisma.category.create({
    data: {
      slug: CAT_SLUG,
      moduleType: "news",
      visible: true,
      translations: {
        create: { locale: "zh-CN", name: "OG集成栏目", description: "OG集成栏目描述文本" },
      },
    },
  });
  await prisma.content.create({
    data: {
      slug: ARTICLE_SLUG,
      categoryId: cat.id,
      status: "PUBLISHED",
      authorName: "OG集成",
      publishAt: new Date("2026-08-02T00:00:00Z"),
      coverUrl: COVER,
      translations: {
        create: {
          locale: "zh-CN",
          title: "OG集成有封面文章",
          summary: "OG集成文章摘要",
          body: "<p>og</p>",
          seoTitle: "OG集成有封面文章SEO标题",
        },
      },
    },
  });
  await prisma.content.create({
    data: {
      slug: BARE_ARTICLE_SLUG,
      categoryId: cat.id,
      status: "PUBLISHED",
      authorName: "OG集成",
      publishAt: new Date("2026-08-01T00:00:00Z"),
      coverUrl: null, // 无封面 → og:image 兜底 LOGO
      translations: {
        create: { locale: "zh-CN", title: "OG集成无封面文章", body: "<p>og</p>" },
      },
    },
  });

  // 栏目二:无任何内容 → og:image 兜底 LOGO
  await prisma.category.create({
    data: {
      slug: BARE_CAT_SLUG,
      moduleType: "news",
      visible: true,
      translations: {
        create: { locale: "zh-CN", name: "OG集成空栏目", description: "OG集成空栏目描述" },
      },
    },
  });

  // 商品:图集 2 图、无封面 → og:image=图集首图(回归锁)
  const prodCat = await prisma.category.create({
    data: {
      slug: PRODUCT_CAT_SLUG,
      moduleType: "product",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "OG集成商品栏目" } },
    },
  });
  await prisma.content.create({
    data: {
      slug: PRODUCT_SLUG,
      categoryId: prodCat.id,
      status: "PUBLISHED",
      authorName: "OG集成",
      publishAt: new Date("2026-08-03T00:00:00Z"),
      coverUrl: null,
      gallery: JSON.stringify([GALLERY_1, "/uploads/og-g2.webp"]),
      translations: {
        create: {
          locale: "zh-CN",
          title: "OG集成商品",
          summary: "OG集成商品摘要",
          body: "<p>og</p>",
          seoTitle: "OG集成商品SEO标题",
        },
      },
    },
  });

  // spawn next dev(独立进程组,DATABASE_URL 注入同一临时测试库;
  // NEXT_TEST_DIST_DIR 隔离构建目录——tests/app 下可能有多个 dev server 并发,
  // 共用 .next 会因读写竞争导致 500)
  let out = "";
  let err = "";
  child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: TEST_DB_URL,
      NEXT_TEST_DIST_DIR: ".next-test-og-tags",
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d: Buffer) => {
    out += d.toString();
  });
  child.stderr?.on("data", (d: Buffer) => {
    err += d.toString();
  });
  child.on("error", (e) => {
    lastError = e;
  });

  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (lastError) break;
    try {
      const r = await fetch(`${BASE}/zh-CN`);
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // 尚未监听:继续轮询
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    throw new Error(
      `dev server 未在 60s 内就绪(port=${PORT})\n[stdout] ${tail(() => out)}\n[stderr] ${tail(() => err)}`
    );
  }
}, 120_000);

afterAll(async () => {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM"); // 杀整个进程组
    } catch {
      // 进程已退出
    }
  }
  // 等子进程组退出后再清理(SIGTERM 异步,立即删会被仍在写盘的 dev server 还原)
  await new Promise((resolve) => setTimeout(resolve, 2000));
  // 清理隔离的构建目录(仅本测试的 distDir,68MB 级,不留仓库垃圾)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      rmSync(path.join(PROJECT_ROOT, ".next-test-og-tags"), { recursive: true, force: true });
      if (!existsSync(path.join(PROJECT_ROOT, ".next-test-og-tags"))) break;
    } catch {
      // 清理失败不影响测试结论
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  // 还原 next dev 对 tsconfig.json 的自动改写(追加自定义 distDir 的 include)
  const tsconfigPath = path.join(PROJECT_ROOT, "tsconfig.json");
  if (tsconfigSnapshot !== null && readFileSync(tsconfigPath, "utf8") !== tsconfigSnapshot) {
    try {
      writeFileSync(tsconfigPath, tsconfigSnapshot);
    } catch {
      // 还原失败不影响测试结论(下次运行会再次快照)
    }
  }
});

describe("TEST-202:首页/栏目页/联系页 openGraph(REQ-003)", () => {
  it("首页:og:title/og:description 来自 SeoMeta(home),og:image=首条启用 Banner 绝对 URL", async () => {
    const res = await fetch(`${BASE}/zh-CN`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(metaContent(html, "og:title")).toContain(HOME_SEO.title);
    expect(metaContent(html, "og:description")).toContain(HOME_SEO.description);
    expect(metaContent(html, "og:image")).toBe(`${SITE}${BANNER}`);
  }, 120_000);

  it("栏目页(有内容):og=栏目翻译名+描述,og:image=栏目树 PUBLISHED 首条封面绝对 URL", async () => {
    const res = await fetch(`${BASE}/zh-CN/c/${CAT_SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(metaContent(html, "og:title")).toContain("OG集成栏目");
    expect(metaContent(html, "og:description")).toContain("OG集成栏目描述文本");
    expect(metaContent(html, "og:image")).toBe(`${SITE}${COVER}`);
  }, 120_000);

  it("无封面栏目:og:image 兜底为品牌 LOGO 绝对 URL", async () => {
    const res = await fetch(`${BASE}/zh-CN/c/${BARE_CAT_SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(metaContent(html, "og:title")).toContain("OG集成空栏目");
    expect(metaContent(html, "og:image")).toBe(LOGO_ABS);
  }, 120_000);

  it("联系页:og:title/og:description 来自 SeoMeta(contact),og:image=LOGO 绝对 URL", async () => {
    const res = await fetch(`${BASE}/zh-CN/contact`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(metaContent(html, "og:title")).toContain(CONTACT_SEO.title);
    expect(metaContent(html, "og:description")).toContain(CONTACT_SEO.description);
    expect(metaContent(html, "og:image")).toBe(LOGO_ABS);
  }, 120_000);

  it("栏目页不存在 slug → 404 分支(不要求 OG 输出)", async () => {
    const res = await fetch(`${BASE}/zh-CN/c/no-such-og-slug`);
    expect(res.status).toBe(404);
  }, 60_000);
});

describe("TEST-203:文章/商品详情 openGraph 回归锁(REQ-004)", () => {
  it("文章详情:og 存在,og:image=封面绝对 URL", async () => {
    const res = await fetch(`${BASE}/zh-CN/article/${ARTICLE_SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(metaContent(html, "og:title")).toContain("OG集成有封面文章SEO标题");
    expect(metaContent(html, "og:description")).toContain("OG集成文章摘要");
    expect(metaContent(html, "og:image")).toBe(`${SITE}${COVER}`);
  }, 120_000);

  it("无封面文章详情:og:image 兜底为品牌 LOGO 绝对 URL(不再缺失/相对路径)", async () => {
    const res = await fetch(`${BASE}/zh-CN/article/${BARE_ARTICLE_SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(metaContent(html, "og:title")).toContain("OG集成无封面文章");
    expect(metaContent(html, "og:image")).toBe(LOGO_ABS);
  }, 120_000);

  it("商品详情:og:image=图集首图绝对 URL(回归锁)", async () => {
    const res = await fetch(`${BASE}/zh-CN/product/${PRODUCT_SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(metaContent(html, "og:title")).toContain("OG集成商品SEO标题");
    expect(metaContent(html, "og:image")).toBe(`${SITE}${GALLERY_1}`);
  }, 120_000);
});
