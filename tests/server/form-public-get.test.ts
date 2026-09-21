import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * 公开表单读取接口 GET /api/form/[slug](V4.8.3)。
 *
 * 用途:前台「悬浮入口 → 表单」在当前页弹层里就地渲染表单,需要先取到字段定义。
 * 边界:**只返回启用中的表单**,且只有 slug/name/fields —— 不含任何提交数据与后台字段。
 */

let db: PrismaClient;
let route: typeof import("@/app/api/form/[slug]/route");

const ENABLED_SLUG = "v483-form-enabled";
const DISABLED_SLUG = "v483-form-disabled";

beforeAll(async () => {
  db = (await import("@/lib/db")).prisma;
  route = await import("@/app/api/form/[slug]/route");
  // 注意:字段类型必须是 FIELD_TYPES 里的合法值(text/textarea/radio/checkbox/select/date/file),
  // 否则 parseFormFields 会丢弃(此处刻意用 text + select 各一,覆盖选项型字段的往返)
  const schema = JSON.stringify([
    { id: "name", type: "text", label: "称呼", required: true },
    { id: "topic", type: "select", label: "咨询方向", required: false, options: ["官网", "小程序"] },
  ]);
  await db.form.create({
    data: { slug: ENABLED_SLUG, name: "在线留言", schema, enabled: true, antiDuplicate: true },
  });
  await db.form.create({
    data: { slug: DISABLED_SLUG, name: "已停用表单", schema, enabled: false, antiDuplicate: true },
  });
});

afterAll(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.form.deleteMany({ where: { slug: { in: [ENABLED_SLUG, DISABLED_SLUG] } } });
});

function get(slug: string) {
  return route.GET(new Request(`http://localhost/api/form/${slug}`), {
    params: Promise.resolve({ slug }),
  });
}

describe("GET /api/form/[slug]", () => {
  it("启用中的表单:返回 slug/name 与字段定义(弹层据此渲染)", async () => {
    const res = await get(ENABLED_SLUG);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { slug: string; name: string; fields: { id: string; label: string; options?: string[] }[] };
    };
    expect(body.ok).toBe(true);
    expect(body.data.slug).toBe(ENABLED_SLUG);
    expect(body.data.name).toBe("在线留言");
    expect(body.data.fields.map((f) => f.label)).toEqual(["称呼", "咨询方向"]);
    // 选项型字段的 options 一并下发(弹层里的下拉才能渲染出来)
    expect(body.data.fields[1].options).toEqual(["官网", "小程序"]);
  });

  it("停用的表单:404(与提交接口同口径,停用即对外不可见)", async () => {
    const res = await get(DISABLED_SLUG);
    expect(res.status).toBe(404);
  });

  it("不存在的表单:404", async () => {
    const res = await get("v483-form-not-exist");
    expect(res.status).toBe(404);
  });

  it("响应体不含提交数据与后台配置字段(只暴露渲染所需)", async () => {
    const res = await get(ENABLED_SLUG);
    const raw = await res.text();
    expect(raw).not.toContain("antiDuplicate");
    expect(raw).not.toContain("submissions");
    expect(raw).not.toContain("relatedKey");
  });
});
