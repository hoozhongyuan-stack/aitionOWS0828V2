import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * TEST-014 / TEST-015 / TEST-016(对应 AC-012 / AC-013 / AC-014),
 * 并锁定 AC-021 / NFR-004 的邮件可靠性语义。
 *
 * 覆盖:
 *  - TEST-014(AC-012):品牌模板含品牌名 + LOGO 绝对 URL、全部样式内联
 *    (无 <style>/<link>)、主题主色注入内联样式、页脚版权/备案、CTA href;
 *  - TEST-021 相关(AC-021/NFR-004):SMTP 未配置时 sendMail 返回 false(现状锁定);
 *    用户可控 fields value 含 <script> 时输出被转义;
 *  - TEST-015(AC-013):en/zh 密码重置文案 + 绝对重置链接 + 有效期提示;非法 locale 回退;
 *  - TEST-016(AC-014):3 字段表单通知含全部键值、来源页、IP、时间、后台 CTA。
 *
 * 约定:品牌/主题配置通过可选参数注入(不依赖 DB 配置);
 * 表格布局 + 全部内联样式;用户可控文本一律 escapeHtml。
 */

// mock nodemailer(被 @/server/notify 动态 import):捕获 sendMail 收到的 text/html
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
const {
  escapeHtml,
  renderBrandEmail,
  renderPasswordResetEmail,
  renderFormSubmissionNotify,
  renderUgcPendingNotify,
} = await import("@/server/notify/template");
const { sendMail } = await import("@/server/notify");
const { prisma } = await import("@/lib/db");
const { invalidateSettingCache } = await import("@/server/setting");

// 测试用品牌/主题配置(getBrandConfig/getThemeConfig 的注入替身)
const brand = {
  siteName: "Acme 工业装备",
  logoUrl: "/uploads/logo.png",
  icp: "京ICP备2026001234号",
  copyright: "© 2026 Acme 工业装备. All rights reserved.",
};
const theme = { primary: "#b45309" };

describe("TEST-014:品牌 HTML 模板(AC-012)", () => {
  it("含品牌名与 LOGO 绝对 URL、无 <style>/<link>、主题色注入内联样式、页脚版权/备案、CTA href", async () => {
    const html = await renderBrandEmail({
      heading: "新的处理提醒",
      blocks: [{ type: "paragraph", text: "正文内容第一段" }],
      cta: { label: "查看详情", url: "https://example.com/admin/items/1" },
      brand,
      theme,
      baseUrl: "https://cdn.example.com",
    });

    // 品牌头部:站点名 + LOGO 相对路径被绝对化
    expect(html).toContain("Acme 工业装备");
    expect(html).toContain("https://cdn.example.com/uploads/logo.png");
    expect(html).toContain("<img");

    // 布局铁律:全部内联样式,无外部 CSS
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<link");
    expect(html).toContain("style=");

    // 主题主色注入内联样式(标题/按钮/高亮块)
    expect(html).toContain("#b45309");
    expect(html).toContain(`color:#b45309`);
    expect(html).toContain(`background-color:#b45309`);

    // 页脚:版权 + 备案号
    expect(html).toContain(brand.copyright);
    expect(html).toContain(brand.icp);

    // CTA 大按钮
    expect(html).toContain(`href="https://example.com/admin/items/1"`);
    expect(html).toContain("查看详情");

    // 表格布局
    expect(html).toContain("<table");
  });

  it("LOGO 缺省时头部兜底为品牌文字(不输出 <img>)", async () => {
    const html = await renderBrandEmail({
      blocks: [],
      brand: { ...brand, logoUrl: "" },
      theme,
    });
    expect(html).toContain("Acme 工业装备");
    expect(html).not.toContain("<img");
  });

  it("支持 paragraph / kvTable / highlight 三种区块", async () => {
    const html = await renderBrandEmail({
      blocks: [
        { type: "paragraph", text: "普通段落" },
        { type: "kvTable", rows: [{ k: "公司", v: "Acme" }] },
        { type: "highlight", text: "重要提醒" },
      ],
      brand,
      theme,
    });
    expect(html).toContain("普通段落");
    expect(html).toContain("公司");
    expect(html).toContain("Acme");
    expect(html).toContain("重要提醒");
    expect(html).toContain("<table");
  });

  it("escapeHtml 转义 & < > \" '", () => {
    expect(escapeHtml(`<a href="x" data-y='z'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;&lt;/a&gt;"
    );
  });
});

describe("TEST-015:密码重置邮件(AC-013)", () => {
  const resetUrl = "https://site.example/en/reset-password?token=abc123def";

  it("locale=en:英文文案 + 绝对重置链接 + 有效期提示", async () => {
    const html = await renderPasswordResetEmail({
      locale: "en",
      resetUrl,
      expireMinutes: 30,
      brand,
      theme,
    });
    expect(html).toContain("Reset your password");
    expect(html).toContain("If you did not request this");
    expect(html).toContain("30 minutes");
    expect(html).toContain(resetUrl);
    expect(html).toContain(`href="${resetUrl}"`);
    expect(html).not.toContain("重置密码");
  });

  it("locale=zh-CN:中文文案 + 重置链接 + 有效期提示", async () => {
    const html = await renderPasswordResetEmail({
      locale: "zh-CN",
      resetUrl,
      expireMinutes: 30,
      brand,
      theme,
    });
    expect(html).toContain("重置密码");
    expect(html).toContain("如果这不是你的操作");
    expect(html).toContain("30 分钟");
    expect(html).toContain(resetUrl);
    expect(html).toContain(`href="${resetUrl}"`);
  });

  it("非法 locale(如 fr/空串)回退英文(规则:非 zh 开头一律 en)", async () => {
    for (const locale of ["fr", ""]) {
      const html = await renderPasswordResetEmail({
        locale,
        resetUrl,
        expireMinutes: 15,
        brand,
        theme,
      });
      expect(html).toContain("Reset your password");
      expect(html).toContain("15 minutes");
    }
  });
});

describe("TEST-016:表单提交管理员通知(AC-014)", () => {
  it("含表单名、3 个字段键值、来源页、IP、时间与后台 CTA;用户可控值被转义", async () => {
    const html = await renderFormSubmissionNotify({
      formName: "联系我们",
      fields: [
        { label: "姓名", value: "张三" },
        { label: "邮箱", value: "zhang@example.com" },
        { label: "留言", value: "<script>alert('xss')</script>" },
      ],
      sourceUrl: "https://site.example/zh-CN/contact",
      ip: "203.0.113.9",
      submittedAt: "2026-08-30 14:00:00",
      adminUrl: "https://site.example/zh-CN/admin/forms/submissions",
      brand,
      theme,
    });

    expect(html).toContain("联系我们");
    expect(html).toContain("姓名");
    expect(html).toContain("张三");
    expect(html).toContain("邮箱");
    expect(html).toContain("zhang@example.com");
    expect(html).toContain("留言");

    // 转义铁律:用户可控值不得以可执行形式出现
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");

    // 来源页 / IP / 时间
    expect(html).toContain("https://site.example/zh-CN/contact");
    expect(html).toContain("203.0.113.9");
    expect(html).toContain("2026-08-30 14:00:00");

    // 后台处理 CTA
    expect(html).toContain("去后台处理");
    expect(html).toContain(`href="https://site.example/zh-CN/admin/forms/submissions"`);
  });
});

describe("renderUgcPendingNotify:投稿/评论待审提醒(REQ-012)", () => {
  it("kind=submission:含类型/标题/作者与后台 CTA", async () => {
    const html = await renderUgcPendingNotify({
      kind: "submission",
      title: "新设备投稿",
      author: "用户#7",
      adminUrl: "https://site.example/zh-CN/admin/review/submissions",
      brand,
      theme,
    });
    expect(html).toContain("用户投稿");
    expect(html).toContain("新设备投稿");
    expect(html).toContain("用户#7");
    expect(html).toContain("去后台处理");
    expect(html).toContain(`href="https://site.example/zh-CN/admin/review/submissions"`);
  });

  it("kind=comment:文案区分评论待审", async () => {
    const html = await renderUgcPendingNotify({
      kind: "comment",
      title: "这篇文章不错",
      brand,
      theme,
    });
    expect(html).toContain("评论");
    expect(html).toContain("这篇文章不错");
  });
});

describe("sendMail 未配置 SMTP(AC-021 / NFR-004 现状锁定)", () => {
  it("临时测试库无 notify 配置:返回 false 且不抛错、不建连", async () => {
    await expect(
      sendMail({ to: ["admin@example.com"], subject: "t", lines: ["l"] })
    ).resolves.toBe(false);
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
});

describe("sendMail 品牌 HTML 扩展(html 字段,AC-012/NFR-004)", () => {
  beforeAll(async () => {
    // 临时测试库植入 SMTP 配置(transport 已被 mock,不会真实建连)
    await prisma.setting.create({
      data: { group: "notify", key: "smtpHost", value: JSON.stringify("smtp.test.local") },
    });
    invalidateSettingCache("notify");
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { group: "notify" } });
    invalidateSettingCache("notify");
    await prisma.$disconnect();
  });

  it("未提供 html 时保持旧行为:text=lines 拼接、html 为仅转义 < 的 <p> 列表(现状锁定)", async () => {
    const ok = await sendMail({
      to: ["a@example.com"],
      subject: "旧格式",
      lines: ["行一", "<b>行二</b>"],
    });
    expect(ok).toBe(true);
    const arg = mocks.smtpSendMail.mock.calls.at(-1)![0] as { text: string; html: string };
    expect(arg.text).toBe("行一\n<b>行二</b>");
    // 现状锁定:旧实现仅转义 "<",不转义 ">"
    expect(arg.html).toBe("<p>行一</p><p>&lt;b>行二&lt;/b></p>");
  });

  it("提供 html 时:html 原样透传,text 用 lines 纯文本兜底", async () => {
    const ok = await sendMail({
      to: ["a@example.com"],
      subject: "品牌邮件",
      lines: ["纯文本兜底第一行"],
      html: "<table><tr><td>品牌 HTML 正文</td></tr></table>",
    });
    expect(ok).toBe(true);
    const arg = mocks.smtpSendMail.mock.calls.at(-1)![0] as { text: string; html: string };
    expect(arg.html).toContain("品牌 HTML 正文");
    expect(arg.text).toBe("纯文本兜底第一行");
  });

  it("提供 html 且 lines 为空时:text 降级为剥离标签的纯文本", async () => {
    const ok = await sendMail({
      to: ["a@example.com"],
      subject: "品牌邮件",
      lines: [],
      html: "<p>第一段</p><p>第二段</p>",
    });
    expect(ok).toBe(true);
    const arg = mocks.smtpSendMail.mock.calls.at(-1)![0] as { text: string; html: string };
    expect(arg.text).toContain("第一段");
    expect(arg.text).toContain("第二段");
    expect(arg.text).not.toContain("<p>");
  });
});
