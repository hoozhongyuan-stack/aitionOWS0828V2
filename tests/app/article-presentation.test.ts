import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DB_URL } from "../setup/db";

/**
 * V4.7.0 前台内容呈现集成测试(SSR 初始 HTML,不执行 JS):
 * - 详情页:摘要导语块 / 关键词标签组 / JSON-LD keywords / 正文列宽 max-w-4xl / 媒体出血容器类
 * - 列表页:作者署名(锁「列表查询取 authorName → shapeCard 透传 → 卡片渲染」整条链)
 * 背景:此前摘要与关键词只进 meta、页面上看不到;列表卡片完全没有作者。
 */

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const PORT = 30000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const DIST_DIR = ".next-test-article-presentation";

const CAT_SLUG = "v470-cat";
const SLUG = "v470-article";
const AUTHOR = "镊子 (Tweezers)";
const SUMMARY = "这是一段用于验证导语块的摘要文本,描述本文要解决的问题。";
const BODY_IMG = "/uploads/2026/09/v470-test.png";

let prisma: typeof import("@/lib/db")["prisma"];
let child: ReturnType<typeof spawn> | null = null;
let lastError: unknown = null;
let tsconfigSnapshot: string | null = null;
let out = "";
let err = "";

function tail(s: string, n = 3000): string {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

async function getHtml(pathname: string): Promise<string> {
  const r = await fetch(`${BASE}${pathname}`);
  expect(r.status, `${pathname} 应 200`).toBe(200);
  return r.text();
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));
  tsconfigSnapshot = readFileSync(path.join(PROJECT_ROOT, "tsconfig.json"), "utf8");

  const cat = await prisma.category.create({
    data: {
      slug: CAT_SLUG,
      moduleType: "article",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "V470 集成栏目" } },
    },
  });
  await prisma.content.create({
    data: {
      slug: SLUG,
      categoryId: cat.id,
      status: "PUBLISHED",
      authorName: AUTHOR,
      publishAt: new Date("2026-09-10T00:00:00Z"),
      coverUrl: "/uploads/2026/09/v470-cover.png",
      translations: {
        create: {
          locale: "zh-CN",
          title: "V470 呈现验证文章",
          summary: SUMMARY,
          // 中英逗号混用,验证清洗(应渲染为 3 个标签)
          seoKeywords: "即时零售，私域, 公域",
          body: `<p>正文首段。</p><img src="${BODY_IMG}" alt="" /><p>正文次段。</p>`,
        },
      },
    },
  });

  child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, NEXT_TEST_DIST_DIR: DIST_DIR },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (err += d.toString()));
  child.on("error", (e) => (lastError = e));

  const deadline = Date.now() + 90_000;
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
      // 尚未监听
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    throw new Error(`dev server 未就绪(port=${PORT})\n[out]${tail(out)}\n[err]${tail(err)}`);
  }
}, 150_000);

afterAll(async () => {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // 已退出
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  try {
    rmSync(path.join(PROJECT_ROOT, DIST_DIR), { recursive: true, force: true });
    if (!existsSync(path.join(PROJECT_ROOT, DIST_DIR))) {
      // 已清理
    }
  } catch {
    // 清理失败不影响结论
  }
  const tsconfigPath = path.join(PROJECT_ROOT, "tsconfig.json");
  if (tsconfigSnapshot !== null && readFileSync(tsconfigPath, "utf8") !== tsconfigSnapshot) {
    try {
      writeFileSync(tsconfigPath, tsconfigSnapshot);
    } catch {
      // 还原失败不影响结论
    }
  }
});

describe("文章详情页呈现(V4.7.0)", () => {
  it("摘要渲染为导语块(封面之后、正文之前),关键词渲染为页尾标签组", async () => {
    const html = await getHtml(`/zh-CN/article/${SLUG}`);
    expect(html).toContain(SUMMARY);
    expect(html).toContain("关键词");
    // 三个标签(中英逗号混写被正确清洗)
    for (const k of ["即时零售", "私域", "公域"]) expect(html).toContain(`>${k}<`);
    // 导语块样式:左侧品牌色竖线
    expect(html).toContain("border-l-[3px]");
    // 正文容器启用媒体出血(仅文章详情页)
    expect(html).toContain("rich-content--bleed");
    // 正文列宽由 max-w-3xl 放宽到 max-w-4xl
    expect(html).toContain("container max-w-4xl");
    expect(html).not.toContain("container max-w-3xl");
  });

  it("结构化数据带 keywords,且 description 优先取摘要", async () => {
    const html = await getHtml(`/zh-CN/article/${SLUG}`);
    // 页面里有多段 JSON-LD(站点级 Organization + 本页 Article),取 Article 那段
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (m) => JSON.parse(m[1]) as Record<string, unknown>
    );
    const data = blocks.find((b) => b["@type"] === "Article");
    expect(data, "应有 Article 结构化数据").toBeDefined();
    expect(String(data.keywords)).toContain("即时零售");
    // 摘要优先于 seoDesc(本例无 seoDesc,应为摘要全文)
    expect(data.description).toBe(SUMMARY);
  });

  it("正文内的图片照常渲染,且详情页不使用 max-w-3xl(避免回退)", async () => {
    const html = await getHtml(`/zh-CN/article/${SLUG}`);
    expect(html).toContain(BODY_IMG);
    expect(html).toContain("正文首段。");
  });
});

describe("内容列表作者署名(V4.7.0)", () => {
  it("栏目页卡片显示作者(锁 select→shapeCard→组件 整链)", async () => {
    const html = await getHtml(`/zh-CN/c/${CAT_SLUG}`);
    expect(html).toContain(AUTHOR);
  });
});
