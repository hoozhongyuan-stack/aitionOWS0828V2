import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DB_URL } from "../setup/db";

/**
 * TEST-019(对应 AC-020 / REQ-002 / NFR-002 自动化部分):商品详情页 SSR 集成——
 * vitest 内 spawn `next dev`(随机端口,DATABASE_URL 指向全局临时测试库),
 * 轮询就绪后 fetch 初始 HTML,断言:图集 img src、参数表关键文本、富文本正文、
 * 询盘表单标记(启用表单时);再断言不存在的商品为 404。
 * 断言全部针对初始 HTML(不执行 JS),即 NFR-002 的可自动化部分。
 */

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const PORT = 30000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;

const SLUG = "pprod-item";
const FORM_NAME = "在线询盘";

let prisma: typeof import("@/lib/db")["prisma"];
let child: ReturnType<typeof spawn> | null = null;
let lastError: unknown = null;

/** 滚动捕获子进程输出尾部,失败时用于诊断 */
function tail(buf: () => string, n = 3000): string {
  const s = buf();
  return s.length > n ? `…${s.slice(-n)}` : s;
}

beforeAll(async () => {
  ({ prisma } = await import("@/lib/db"));

  // 预置:product 栏目 + 已发布商品(图集 2 图 / 参数 2 行 / 启用中的询盘表单)
  const cat = await prisma.category.create({
    data: {
      slug: "pprod-cat",
      moduleType: "product",
      visible: true,
      translations: { create: { locale: "zh-CN", name: "集成测试产品栏目" } },
    },
  });
  const form = await prisma.form.create({
    data: {
      slug: "pprod-form",
      name: FORM_NAME,
      enabled: true,
      schema: JSON.stringify([{ id: "f_name", type: "text", label: "姓名", required: true }]),
    },
  });
  await prisma.content.create({
    data: {
      slug: SLUG,
      categoryId: cat.id,
      status: "PUBLISHED",
      authorName: "集成测试",
      publishAt: new Date("2026-08-01T00:00:00Z"),
      coverUrl: "/uploads/pg-cover.webp",
      gallery: JSON.stringify(["/uploads/pg-1.webp", "/uploads/pg-2.webp"]),
      specs: JSON.stringify([
        { k: "型号", v: "DX-900" },
        { k: "材质", v: "铝合金机身" },
      ]),
      formId: form.id,
      translations: {
        create: {
          locale: "zh-CN",
          title: "集成测试商品",
          summary: "集成测试商品摘要",
          body: "<p>集成测试正文段落,服务端渲染可见。</p>",
          seoTitle: "集成测试商品 SEO 标题",
        },
      },
    },
  });

  // spawn next dev(独立进程组,DATABASE_URL 注入同一临时测试库)
  let out = "";
  let err = "";
  child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    detached: true, // 建立进程组,afterAll 可整组杀掉(npx→next→子进程)
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

  // 轮询就绪:fetch 首页直至 200,≤60s
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

afterAll(() => {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM"); // 杀整个进程组
    } catch {
      // 进程已退出
    }
  }
});

describe("TEST-019:商品详情页初始 HTML(SSR 集成)", () => {
  it(
    "已发布商品:初始 HTML 含图集 img、参数表、富文本正文与询盘表单标记",
    async () => {
      const res = await fetch(`${BASE}/zh-CN/product/${SLUG}`);
      expect(res.status).toBe(200);
      const html = await res.text();

      // 图集:两张图都以 img src 进入初始 HTML(无 JS 可见)
      expect(html).toContain('src="/uploads/pg-1.webp"');
      expect(html).toContain('src="/uploads/pg-2.webp"');
      // 参数表:键与值均为可见文本
      expect(html).toContain("型号");
      expect(html).toContain("DX-900");
      expect(html).toContain("铝合金机身");
      // 富文本正文(消毒渲染管线)
      expect(html).toContain("集成测试正文段落");
      // 询盘表单:表单名 + <form> 元素标记
      expect(html).toContain(FORM_NAME);
      expect(html).toContain("<form");
      // 单页 TDK 来自 ContentTranslation
      expect(html).toContain("集成测试商品 SEO 标题");
    },
    180_000 // 首次命中路由触发 dev 按需编译
  );

  it("不存在/未发布的商品详情返回 404", async () => {
    const res = await fetch(`${BASE}/zh-CN/product/no-such-product-xyz`);
    expect(res.status).toBe(404);
  }, 60_000);
});
