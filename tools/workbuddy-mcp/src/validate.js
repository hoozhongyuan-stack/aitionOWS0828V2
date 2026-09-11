/**
 * 推送前硬校验与辅助生成。
 * 原则：**不合格直接拒绝并说明缺什么**（不让脏数据进库）；能自动补的（slug/摘要）自动补并回报。
 */

/** 官网 slug 规则（services/contents PUT 的 zod 约束）：^[a-z0-9-]+$ */
const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * 生成/校验 slug。
 * @param {string|undefined} title 标题（调用方应**优先传英文标题**，ASCII 提取质量最高）
 * @param {string|undefined} provided 调用方显式提供的 slug
 */
export function resolveSlug(title, provided) {
  if (provided && String(provided).trim()) {
    const s = String(provided).trim().toLowerCase();
    if (!SLUG_RE.test(s)) {
      return { error: `slug 只允许小写字母、数字与连字符（收到：${provided}）` };
    }
    return { slug: s };
  }

  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const base = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/^-|-$/g, "");

  // 足够长的英文短语：直接用作 slug（可读性最好）
  if (base.length >= 8) return { slug: base, auto: true };
  // 过短或从中文标题里只抠出零碎词（如 "mcp"）：补日期后缀，保证唯一且能看出时间
  if (base.length >= 3) return { slug: `${base}-${stamp}`, auto: true };
  // 完全无法提取（纯中文标题）：日期 + 短随机
  const rand = Math.random().toString(36).slice(2, 6);
  return { slug: `article-${stamp}-${rand}`, auto: true };
}

/**
 * 校验文章输入。
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateArticleInput({ categoryId, zh, en, status, publishAt, authorName }) {
  const errors = [];
  const warnings = [];
  const zhTitle = zh?.title?.trim();
  const enTitle = en?.title?.trim();
  const zhBody = zh?.body?.trim();
  const enBody = en?.body?.trim();

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    errors.push("缺少或非法 categoryId —— 先调 list_categories 查栏目 id");
  }
  if (!zhTitle && !enTitle) errors.push("至少需要一种语言的标题（zh.title 或 en.title）");
  if (!zhBody && !enBody) errors.push("至少需要一种语言的正文（zh.body 或 en.body）");

  if (zhTitle && !zhBody) errors.push("提供了 zh.title 但 zh.body 为空");
  if (enTitle && !enBody) errors.push("提供了 en.title 但 en.body 为空");

  if (zhTitle && !enTitle) {
    warnings.push("未提供英文版：本站为中英双语站点，建议补 en 使文章形态与站内现有内容一致");
  }
  if (authorName !== undefined && !String(authorName).trim()) {
    errors.push("authorName 不能为空字符串（不传则由工具使用默认作者）");
  }

  const seoChecks = [
    ["zh.seoTitle", zh?.seoTitle, 60],
    ["en.seoTitle", en?.seoTitle, 60],
    ["zh.seoDesc", zh?.seoDesc, 160],
    ["en.seoDesc", en?.seoDesc, 160],
  ];
  for (const [label, value, max] of seoChecks) {
    if (value && String(value).length > max) {
      warnings.push(`${label} 超过 ${max} 字符（${String(value).length}），搜索/AI 引擎可能截断`);
    }
  }

  if (status === "SCHEDULED") {
    if (!publishAt) {
      errors.push("status=SCHEDULED 必须提供 publishAt（ISO 时间，如 2026-09-12T09:00:00+08:00）");
    } else if (Number.isNaN(Date.parse(publishAt))) {
      errors.push(`publishAt 不是合法时间：${publishAt}`);
    } else if (Date.parse(publishAt) <= Date.now()) {
      warnings.push("publishAt 已是过去时间 —— 官网语义为「立即发布」而非定时，如需定时请给未来时间");
    }
  }
  if (status === "PUBLISHED") {
    warnings.push("status=PUBLISHED 将立即对访客与搜索引擎可见；如需先审阅请用 DRAFT 或 SCHEDULED");
  }

  return { errors, warnings };
}

/**
 * 按 id / slug / 名称定位栏目（容忍中英文名称）。
 * @returns {{ category?: object, error?: string }}
 */
export function resolveCategory(categories, { categoryId, slug, name }) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return { error: "官网未返回任何栏目，请先在后台创建栏目" };
  }
  if (categoryId !== undefined && categoryId !== null && categoryId !== "") {
    const hit = categories.find((c) => Number(c.id) === Number(categoryId));
    return hit ? { category: hit } : { error: `未找到 id=${categoryId} 的栏目` };
  }
  if (slug || name) {
    const key = String(slug || name).trim().toLowerCase();
    const hit = categories.find(
      (c) =>
        String(c.slug || "").toLowerCase() === key ||
        (Array.isArray(c.translations) &&
          c.translations.some((t) => String(t.name || "").toLowerCase() === key))
    );
    return hit ? { category: hit } : { error: `未找到名为「${slug || name}」的栏目（试试 list_categories）` };
  }
  return { error: "缺少栏目：请传 categoryId，或传栏目名称（slug/name），可先调 list_categories" };
}

/** 栏目的人类可读摘要（供工具回执） */
export function describeCategory(c) {
  const names = (c.translations || [])
    .map((t) => t.name)
    .filter(Boolean)
    .join(" / ");
  return `#${c.id} ${names || c.slug}${c.moduleType ? ` [${c.moduleType}]` : ""}`;
}
