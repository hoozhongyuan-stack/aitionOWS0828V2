import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

/**
 * TEST(REQ-011 / AC-013 链路锁定,TASK-008 调用点接入):
 * 密码重置完整链路 —— requestPasswordReset → renderPasswordResetEmail(品牌模板)
 * → sendMail(html)。断言真实 sendMail 收到的:
 *  - html 含品牌名、可点击重置链接(CTA <a href>)与有效期提示(品牌模板特征);
 *  - text 为纯文本兜底(不含任何 HTML 标签)。
 *
 * 同时锁定 TASK-008 接入的两处管理员通知调用点(REQ-012):
 *  - submitForm → renderFormSubmissionNotify(html:表单名/字段键值/IP/时间/后台 CTA);
 *  - submitUserContent → renderUgcPendingNotify(html:投稿待审/标题/作者/后台 CTA)。
 * 二者保持「通知总开关 / 静默失败 / fire-and-forget」语义。
 *
 * mock:notify 配置(SMTP host 非空)经 Setting 表注入;nodemailer 动态 import 被
 * vi.mock 替换,捕获 transporter.sendMail 实参,不真实建连。
 */

const mocks = vi.hoisted(() => {
  const smtpSendMail = vi.fn(async (..._args: unknown[]) => ({ messageId: "<test@local>" }));
  const createTransport = vi.fn((_opts?: unknown) => ({
    sendMail: smtpSendMail,
    close: () => {},
  }));
  return { smtpSendMail, createTransport };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

// tests/setup/db.ts 已先设 DATABASE_URL 并建好临时测试库;按其约定用动态 import
const { requestPasswordReset } = await import("@/server/user/password-reset");
const { submitForm } = await import("@/server/form");
const { submitUserContent } = await import("@/server/ugc");
const { prisma }: { prisma: PrismaClient } = await import("@/lib/db");
const { invalidateSettingCache } = await import("@/server/setting");

const BRAND_SITE_NAME = "邮件链路测试站";
let userId = 0;
let formId = 0;
let categoryId = 0;
let ugcUserId = 0;

/** fire-and-forget 通知:轮询等待第 n 次 sendMail 发生 */
async function waitForSendCalls(n: number): Promise<void> {
  await vi.waitFor(
    () => {
      expect(mocks.smtpSendMail).toHaveBeenCalledTimes(n);
    },
    { timeout: 10_000, interval: 50 }
  );
}

beforeAll(async () => {
  // SMTP host 非空(transport 已 mock,不会真实建连);通知总开关开启
  await prisma.setting.createMany({
    data: [
      { group: "notify", key: "smtpHost", value: JSON.stringify("smtp.test.local") },
      { group: "notify", key: "enabled", value: JSON.stringify(true) },
      { group: "notify", key: "adminEmail", value: JSON.stringify("boss@test.local") },
      { group: "brand", key: "siteName", value: JSON.stringify(BRAND_SITE_NAME) },
    ],
  });
  invalidateSettingCache("notify");
  invalidateSettingCache("brand");

  const user = await prisma.user.create({
    data: { email: "reset-user@test.local", nickname: "重置用户", status: "ACTIVE" },
  });
  userId = user.id;
  const ugcUser = await prisma.user.create({
    data: { email: "ugc-user@test.local", nickname: "投稿作者本尊", status: "ACTIVE" },
  });
  ugcUserId = ugcUser.id;

  const category = await prisma.category.create({
    data: {
      slug: "mail-ux-cat",
      moduleType: "article",
      allowSubmit: true,
      visible: true,
      translations: { create: { locale: "zh-CN", name: "邮件链路栏目" } },
    },
  });
  categoryId = category.id;

  const form = await prisma.form.create({
    data: {
      name: "询盘获客表单",
      slug: "mail-ux-form",
      enabled: true,
      antiDuplicate: false,
      schema: JSON.stringify([
        { id: "company", type: "text", label: "公司名称", required: true },
        { id: "phone", type: "text", label: "联系电话", required: false },
      ]),
    },
  });
  formId = form.id;
});

afterAll(async () => {
  await prisma.formSubmission.deleteMany({ where: { formId } });
  await prisma.form.deleteMany({ where: { id: formId } });
  await prisma.content.deleteMany({ where: { categoryId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, ugcUserId] } } });
  await prisma.setting.deleteMany({
    where: { OR: [{ group: "notify" }, { group: "brand", key: "siteName" }] },
  });
  invalidateSettingCache("notify");
  invalidateSettingCache("brand");
  await prisma.$disconnect();
});

describe("REQ-011 链路锁定:密码重置邮件走品牌模板(AC-013)", () => {
  it("en:html 含品牌名、可点击重置链接与有效期提示;text 为纯文本兜底", async () => {
    await requestPasswordReset("reset-user@test.local", "en");
    await waitForSendCalls(1);

    const arg = mocks.smtpSendMail.mock.calls[0]![0] as {
      to: string[];
      subject: string;
      html: string;
      text: string;
    };
    expect(arg.to).toEqual(["reset-user@test.local"]);
    expect(arg.subject).toContain(BRAND_SITE_NAME);

    // 品牌 HTML 模板特征:CTA 可点击重置链接 + 品牌名 + 有效期提示
    expect(arg.html).toContain(BRAND_SITE_NAME);
    expect(arg.html).toContain("<a href=");
    expect(arg.html).toContain("Reset your password");
    expect(arg.html).toContain("30 minutes");
    const link = arg.html.match(/https?:\/\/[^"']+\/en\/reset-password\?token=[0-9a-f]{64}/);
    expect(link, "html 应含绝对重置链接(含一次性 token)").toBeTruthy();

    // text:纯文本兜底(lines 拼接),不含 HTML 标签
    expect(arg.text).not.toContain("<");
    expect(arg.text).toContain("/en/reset-password?token=");
    expect(arg.text).toContain("30 minutes");
  });

  it("zh-CN:html 为中文品牌模板(重置密码标题 + 30 分钟提示)", async () => {
    await requestPasswordReset("reset-user@test.local", "zh-CN");
    await waitForSendCalls(2);

    const arg = mocks.smtpSendMail.mock.calls.at(-1)![0] as { html: string; text: string };
    expect(arg.html).toContain(BRAND_SITE_NAME);
    expect(arg.html).toContain("重置密码");
    expect(arg.html).toContain("30 分钟");
    expect(arg.html).toMatch(/\/zh-CN\/reset-password\?token=[0-9a-f]{64}/);
    expect(arg.text).not.toContain("<");
  });
});

describe("REQ-012 调用点接入:表单提交通知走品牌模板(保持开关/静默/异步语义)", () => {
  it("submitForm 后管理员收到 html:表单名 + 字段键值 + IP/时间 + 后台 CTA", async () => {
    await submitForm({
      slug: "mail-ux-form",
      data: { company: "Acme 装备有限公司", phone: "13800000000" },
      ip: "203.0.113.9",
      userAgent: "vitest",
    });
    await waitForSendCalls(3);

    const arg = mocks.smtpSendMail.mock.calls.at(-1)![0] as {
      to: string[];
      html: string;
      text: string;
    };
    expect(arg.to).toEqual(["boss@test.local"]);
    expect(arg.html).toContain("询盘获客表单");
    expect(arg.html).toContain("公司名称");
    expect(arg.html).toContain("Acme 装备有限公司");
    expect(arg.html).toContain("203.0.113.9");
    expect(arg.html).toContain("去后台处理");
    expect(arg.html).toContain("/admin/forms/data/");
    // 品牌 HTML(表格键值)而非旧的 <p> 行拼接
    expect(arg.html).toContain("<table");
    expect(arg.html).toContain("<a href=");
    // text 纯文本兜底
    expect(arg.text).not.toContain("<");
    expect(arg.text).toContain("Acme 装备有限公司");
  });
});

describe("REQ-012 调用点接入:投稿待审通知走品牌模板(保持开关/静默/异步语义)", () => {
  it("submitUserContent 后管理员收到 html:投稿待审 + 标题/作者 + 后台 CTA", async () => {
    await submitUserContent({
      userId: ugcUserId,
      categoryId,
      locale: "zh-CN",
      title: "邮件链路投稿标题",
      summary: null,
      body: "<p>这篇正文足够长,用于通过最短长度校验。</p>",
      coverUrl: null,
    });
    await waitForSendCalls(4);

    const arg = mocks.smtpSendMail.mock.calls.at(-1)![0] as {
      to: string[];
      html: string;
      text: string;
    };
    expect(arg.to).toEqual(["boss@test.local"]);
    expect(arg.html).toContain("用户投稿");
    expect(arg.html).toContain("邮件链路投稿标题");
    expect(arg.html).toContain("投稿作者本尊");
    expect(arg.html).toContain("去后台处理");
    expect(arg.html).toContain("/admin/ugc");
    expect(arg.html).toContain("<table");
    expect(arg.html).toContain("<a href=");
    expect(arg.text).not.toContain("<");
    expect(arg.text).toContain("邮件链路投稿标题");
  });
});
