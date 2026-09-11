#!/usr/bin/env node
/**
 * AitionOWS 官网内容推送 MCP Server。
 *
 * 场景：在 WorkBuddy（或任何 MCP 客户端）里写好文章 → 调 push_article → 官网生成草稿
 *      → 人工过目 → 在后台发布（或用 SCHEDULED 定时上线）。
 *
 * 环境变量（写在 MCP 配置的 env 里，不进对话）：
 *   AITION_API_BASE   官网地址，如 https://aition.art
 *   AITION_API_TOKEN  管理员令牌（scripts/issue-admin-token.ts 签发；
 *                     建议用只勾「内容管理」的 STAFF 子账号生成的令牌）
 *   AITION_AUTHOR     可选，缺省作者名（默认「编辑部」）
 *
 * 注意：MCP 走 stdio 协议，**stdout 只允许协议消息**，所有日志一律走 stderr。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { z } from "zod";

import { createApiClient, AitionApiError } from "./src/api.js";
import { markdownToSafeHtml, plainExcerpt, detectRiskySyntax } from "./src/md-to-html.js";
import { resolveSlug, validateArticleInput, resolveCategory, describeCategory } from "./src/validate.js";

const API_BASE = process.env.AITION_API_BASE;
const API_TOKEN = process.env.AITION_API_TOKEN;
const DEFAULT_AUTHOR = process.env.AITION_AUTHOR?.trim() || "编辑部";

const STATUS_LABEL = {
  DRAFT: "草稿（未公开，需人工发布）",
  PUBLISHED: "已发布（立即公开）",
  SCHEDULED: "定时发布（到点由官网自动上线）",
  OFFLINE: "已下架",
};

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });

/** 统一错误出口：把可操作的提示原样回给 AI（而不是抛裸栈） */
function handleError(e) {
  if (e instanceof AitionApiError) return fail(`✗ ${e.message}`);
  return fail(`✗ 意外错误：${e instanceof Error ? e.message : String(e)}`);
}

// 协议层显示的 server 名（MCP 客户端会展示它）；mcp.json 里的键名可另取，见 README
const server = new McpServer({ name: "aition-content", version: "1.0.0" });

/** API 客户端（配置缺失时明确退出并说明怎么修；stderr 会进 MCP 客户端日志） */
const api = (() => {
  try {
    return createApiClient({ baseUrl: API_BASE, token: API_TOKEN });
  } catch (e) {
    process.stderr.write(`[aition-mcp] 启动失败：${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  }
})();

// ────────────────────────────────────────────────────────────
// 工具 1：列出栏目
// ────────────────────────────────────────────────────────────
server.tool(
  "list_categories",
  "列出官网全部栏目（id / 中英文名称 / slug / 类型）。推送文章前用它确定 categoryId。",
  {},
  async () => {
    try {
      const cats = await api.listCategories();
      if (!cats.length) return ok("官网当前没有栏目，请先在后台「内容 → 栏目」创建。");
      const lines = cats.map((c) => `- ${describeCategory(c)}  slug=${c.slug}`);
      return ok(`官网栏目（${cats.length} 个）：\n${lines.join("\n")}`);
    } catch (e) {
      return handleError(e);
    }
  }
);

// ────────────────────────────────────────────────────────────
// 工具 2：列出已有内容（查重 / 了解站内风格）
// ────────────────────────────────────────────────────────────
server.tool(
  "list_articles",
  "列出官网已有内容（可按关键词/栏目/状态过滤）。推送前用它查重、避免与既发文章撞题或撞 slug。",
  {
    keyword: z.string().optional().describe("标题关键词"),
    categoryId: z.number().int().positive().optional().describe("限定栏目 id"),
    status: z.enum(["DRAFT", "PUBLISHED", "SCHEDULED", "OFFLINE"]).optional(),
    page: z.number().int().min(1).optional().describe("页码，默认 1"),
  },
  async (args) => {
    try {
      const data = await api.listContents({
        keyword: args.keyword,
        categoryId: args.categoryId,
        status: args.status,
        page: args.page ?? 1,
      });
      const items = data.items ?? [];
      if (!items.length) return ok("没有匹配的内容。");
      const lines = items.map((it) => {
        const title = it.translations?.[0]?.title ?? it.slug;
        return `- #${it.id} [${STATUS_LABEL[it.status] ?? it.status}] ${title}  slug=${it.slug}`;
      });
      return ok(`共 ${data.total} 条，本页 ${items.length} 条：\n${lines.join("\n")}`);
    } catch (e) {
      return handleError(e);
    }
  }
);

// ────────────────────────────────────────────────────────────
// 工具 3：读取单篇现状（改稿前必看）
// ────────────────────────────────────────────────────────────
server.tool(
  "get_article",
  "读取单篇内容详情：各语言标题/摘要/正文（正文为官网存储的 HTML）与状态。改稿前先读，确认要改什么。",
  { id: z.number().int().positive().describe("内容 id（list_articles 可查）") },
  async ({ id }) => {
    try {
      const c = await api.getContent(id);
      if (!c) return fail(`✗ 未找到 id=${id} 的内容`);
      const blocks = (c.translations ?? []).map(
        (t) =>
          `【${t.locale}】${t.title}\n摘要：${t.summary ?? "（无）"}\n正文（HTML）：\n${t.body ?? ""}`
      );
      return ok(
        `#${c.id} ${c.slug}\n状态：${STATUS_LABEL[c.status] ?? c.status}\n` +
          `作者：${c.authorName}｜封面：${c.coverUrl ?? "（无）"}｜定时：${c.publishAt ?? "（无）"}\n\n` +
          blocks.join("\n\n———\n\n")
      );
    } catch (e) {
      return handleError(e);
    }
  }
);

// ────────────────────────────────────────────────────────────
// 工具 4：推送文章（新建 / 更新合一）
// ────────────────────────────────────────────────────────────
const langInput = z.object({
  title: z.string().describe("标题"),
  summary: z.string().optional().describe("摘要；不传则自动从正文提取"),
  body: z.string().describe("正文 Markdown（从 ## 二级标题起；# 会被自动降级为 ##）"),
  seoTitle: z.string().optional().describe("SEO 标题（≤60 字符）"),
  seoKeywords: z.string().optional().describe("SEO 关键词，逗号分隔"),
  seoDesc: z.string().optional().describe("SEO 描述（≤160 字符）"),
});

server.tool(
  "push_article",
  `把写好的文章推送到官网（默认存为**草稿**，人工过目后再发布）。
用法要点：
- 新建：不传 id；更新：传 id（**只覆盖你传的字段**，其余保留原值）
- 正文用 Markdown，工具自动转成官网白名单 HTML；正文从 ## 起（# 会自动降为 ##）
- 中英双语：分别传 zh / en；本站为双语站点，建议两份都提供
- 封面图：传 coverImagePath（本机文件路径），工具自动上传并入库
- 定时上线：status=SCHEDULED + publishAt（ISO，如 2026-09-12T09:00:00+08:00）
- 栏目：传 categoryId，或传 categoryName（中英文名称皆可）`,
  {
    id: z.number().int().positive().optional().describe("更新已有内容时传其 id；新建不传"),
    slug: z.string().optional().describe("URL 标识（小写字母/数字/连字符）；不传自动生成"),
    categoryId: z.number().int().positive().optional().describe("栏目 id（与 categoryName 二选一）"),
    categoryName: z.string().optional().describe("栏目名称，中英文皆可（替代 categoryId）"),
    status: z
      .enum(["DRAFT", "SCHEDULED", "PUBLISHED"])
      .optional()
      .describe("默认 DRAFT；SCHEDULED 需同时给 publishAt"),
    publishAt: z.string().optional().describe("定时发布时间（ISO），status=SCHEDULED 时必填"),
    authorName: z.string().optional().describe("作者显示名；不传用原值或默认作者"),
    coverImagePath: z.string().optional().describe("封面图本地文件路径（jpg/png/webp/gif/svg）"),
    zh: langInput.optional().describe("中文版"),
    en: langInput.optional().describe("英文版"),
  },
  async (args) => {
    try {
      // 1) 栏目
      const categories = await api.listCategories();
      const catRes = resolveCategory(categories, {
        categoryId: args.categoryId,
        name: args.categoryName,
      });
      if (catRes.error) {
        const list = categories.map((c) => `- ${describeCategory(c)}`).join("\n");
        return fail(`✗ ${catRes.error}\n\n可选栏目：\n${list}`);
      }
      const category = catRes.category;

      // 2) 更新场景：先读现状（PUT 是整体覆盖语义，必须带全字段）
      let existing = null;
      if (args.id) {
        existing = await api.getContent(args.id);
        if (!existing) return fail(`✗ 未找到 id=${args.id} 的内容`);
      }

      // 3) 组装双语 translations（传入的用 Markdown 转换，未传的保留原 HTML）
      const translations = [];
      const riskyNotes = [];
      const autoNotes = [];
      for (const [key, locale] of [
        ["zh", "zh-CN"],
        ["en", "en"],
      ]) {
        const input = args[key];
        const prev = existing?.translations?.find((t) => t.locale === locale);
        if (input) {
          riskyNotes.push(...detectRiskySyntax(input.body).map((n) => `[${key}] ${n}`));
          const summary = input.summary?.trim();
          if (!summary) autoNotes.push(`[${key}] 摘要未提供，已自动从正文提取`);
          translations.push({
            locale,
            title: input.title.trim(),
            summary: summary || plainExcerpt(input.body),
            body: markdownToSafeHtml(input.body),
            seoTitle: input.seoTitle?.trim() || null,
            seoKeywords: input.seoKeywords?.trim() || null,
            seoDesc: input.seoDesc?.trim() || null,
          });
        } else if (prev) {
          translations.push({ ...prev });
        }
      }

      // 4) 硬校验（不合格直接拒绝，不写库）
      const status = args.status ?? existing?.status ?? "DRAFT";
      const { errors, warnings } = validateArticleInput({
        categoryId: category.id,
        zh: translations.find((t) => t.locale === "zh-CN"),
        en: translations.find((t) => t.locale === "en"),
        status,
        publishAt: args.publishAt,
        authorName: args.authorName,
      });
      if (errors.length) {
        return fail("✗ 校验未通过（未写入任何内容）：\n" + errors.map((e) => `- ${e}`).join("\n"));
      }

      // 5) slug（新建自动生成；更新默认沿用原值，显式传入才改）
      // 优先用英文标题推导——ASCII 提取质量最高；纯中文标题会退化为「日期+随机」
      const titleForSlug =
        translations.find((t) => t.locale === "en")?.title ??
        translations.find((t) => t.locale === "zh-CN")?.title;
      let slug = existing?.slug ?? null;
      let slugAuto = false;
      if (args.slug) {
        const r = resolveSlug(titleForSlug, args.slug);
        if (r.error) return fail(`✗ ${r.error}`);
        slug = r.slug;
      } else if (!slug) {
        const r = resolveSlug(titleForSlug, undefined);
        slug = r.slug;
        slugAuto = true;
      }

      // 6) 封面图（可选）
      let coverUrl = existing?.coverUrl ?? null;
      if (args.coverImagePath) {
        const ext = extname(args.coverImagePath).toLowerCase();
        const mime = MIME_BY_EXT[ext];
        if (!mime) {
          return fail(`✗ 不支持的图片格式 ${ext}（支持：${Object.keys(MIME_BY_EXT).join(" / ")}）`);
        }
        let buffer;
        try {
          buffer = await readFile(args.coverImagePath);
        } catch {
          return fail(`✗ 读不到封面图文件：${args.coverImagePath}`);
        }
        const asset = await api.uploadFile({
          buffer,
          filename: basename(args.coverImagePath),
          mime,
          alt: translations.find((t) => t.locale === "zh-CN")?.title,
        });
        if (!asset?.url) return fail("✗ 图片上传成功但未返回可用路径，请联系维护者");
        coverUrl = asset.url;
      }

      // 7) 提交
      const payload = {
        ...(args.id ? { id: args.id } : {}),
        slug,
        categoryId: category.id,
        status,
        authorName: args.authorName?.trim() || existing?.authorName || DEFAULT_AUTHOR,
        coverUrl,
        publishAt: status === "SCHEDULED" ? args.publishAt ?? existing?.publishAt ?? null : null,
        translations,
      };
      const saved = await api.saveContent(payload);

      // 8) 回执（用本地已确定的变量，不依赖接口返回结构）
      const isUpdate = Boolean(args.id);
      const lines = [
        isUpdate ? "✓ 已更新官网内容" : "✓ 已推送到官网",
        "",
        `  标题     : ${translations.map((t) => t.title).filter(Boolean).join(" / ")}`,
        `  栏目     : ${describeCategory(category)}`,
        `  状态     : ${STATUS_LABEL[status] ?? status}`,
        `  slug     : ${slug}${slugAuto ? "（自动生成，可在后台改）" : ""}`,
        `  封面     : ${coverUrl ?? "（无）"}`,
        status === "SCHEDULED" && payload.publishAt ? `  定时     : ${payload.publishAt}` : null,
        `  后台编辑 : ${api.absolute(`/zh-CN/admin/content/edit/${saved.id}`)}`,
      ].filter(Boolean);
      if (warnings.length) {
        lines.push("", "提示：", ...warnings.map((w) => `- ${w}`));
      }
      if (autoNotes.length) {
        lines.push("", "自动补齐：", ...autoNotes.map((n) => `- ${n}`));
      }
      if (riskyNotes.length) {
        lines.push("", "格式提醒（已按官网白名单处理）：", ...riskyNotes.map((n) => `- ${n}`));
      }
      if (status === "DRAFT") {
        lines.push("", "下一步：在官网后台过目后发布；或重新调用本工具并传 status=SCHEDULED + publishAt 定时上线。");
      }
      return ok(lines.join("\n"));
    } catch (e) {
      return handleError(e);
    }
  }
);

// ────────────────────────────────────────────────────────────
// 工具 5：上传图片（正文内嵌插图用）
// ────────────────────────────────────────────────────────────
server.tool(
  "upload_image",
  `上传一张本地图片到官网素材库，返回可直接用于正文的 URL。
用法：先上传拿到 URL，再在文章 Markdown 里以 ![](URL) 引用；封面图无需单独上传（push_article 的 coverImagePath 会自动处理）。`,
  {
    path: z.string().describe("本地图片文件路径"),
    alt: z.string().optional().describe("图片替代文字（利于 SEO / GEO，建议填写）"),
  },
  async ({ path, alt }) => {
    try {
      const ext = extname(path).toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (!mime) return fail(`✗ 不支持的图片格式 ${ext}（支持：${Object.keys(MIME_BY_EXT).join(" / ")}）`);
      let buffer;
      try {
        buffer = await readFile(path);
      } catch {
        return fail(`✗ 读不到文件：${path}`);
      }
      const asset = await api.uploadFile({ buffer, filename: basename(path), mime, alt });
      if (!asset?.url) return fail("✗ 上传成功但未返回可用路径");
      return ok(
        `✓ 已上传\n\n  路径 : ${asset.url}\n  绝对地址 : ${api.absolute(asset.url)}\n  尺寸 : ${asset.width ?? "?"}×${asset.height ?? "?"}\n\n` +
          `在正文里引用：![${alt ?? ""}](${asset.url})`
      );
    } catch (e) {
      return handleError(e);
    }
  }
);

// ────────────────────────────────────────────────────────────
// 启动
// ────────────────────────────────────────────────────────────
process.stderr.write(
  `[aition-mcp] 已启动｜官网=${API_BASE}｜作者=${DEFAULT_AUTHOR}｜令牌=已配置（${String(API_TOKEN).length} 字符）\n`
);

const transport = new StdioServerTransport();
await server.connect(transport);
