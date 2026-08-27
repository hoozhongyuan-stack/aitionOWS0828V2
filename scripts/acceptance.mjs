/**
 * 总验收脚本(Node,UTF-8 可靠):
 * 1) 前台中文 SSR 渲染 2) UGC 审核红线 3) 表单提交+防重复 4) 维护模式即时性 5) 点赞防刷
 */
const base = process.env.BASE_URL ?? "http://localhost:3000"; // 可指向验收专用实例
let pass = 0, fail = 0;
function check(name, ok) {
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  ok ? pass++ : fail++;
}

async function html(path) {
  const r = await fetch(base + path);
  return { status: r.status, text: await r.text() };
}
async function api(path, method = "GET", body, cookie) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})), headers: r.headers };
}

// —— 管理员会话 ——
const loginRes = await fetch(base + "/api/admin/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  // 凭据走环境变量(口令早已不再是出厂默认;兼容老口令兜底)
  body: JSON.stringify({
    username: process.env.ADMIN_USER ?? "admin",
    password: process.env.ADMIN_PASS ?? "admin888",
  }),
});
const adminCookie = loginRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

// 1. 前台中文 SSR
{
  const art = await html("/zh-CN/article/welcome-aition");
  check("文章页标题 SSR(中文)", art.text.includes("欢迎使用 AitionOWS"));
  check("文章页富文本正文", art.text.includes("核心亮点"));
  check("页头导航(新闻资讯)", art.text.includes("新闻资讯"));
  check("JSON-LD 结构化数据", art.text.includes("application/ld+json"));
  const en = await html("/en/article/welcome-aition");
  check("英文版内容渲染", en.text.includes("Welcome to AitionOWS"));
  const cat = await html("/zh-CN/c/news");
  check("栏目页列表", cat.status === 200 && cat.text.includes("welcome-aition"));
}

// 2. UGC 审核红线:评论提交后前台不可见 → 审核通过后可见
{
  const guest = await api("/api/comment", "POST", { contentId: 1, body: "验收测试评论:这套系统真不错!", guestName: "验收员" });
  check("游客评论被拒(默认需登录)", guest.status === 401);

  // 注册一个用户来评论
  const reg = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `acc-${Date.now()}@test.com`, password: "test12345678", nickname: "验收用户", agree: true }),
  });
  const userCookie = reg.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  check("邮箱注册成功", reg.status === 200);

  const remark = `验收测试评论:这套系统真不错!(${Date.now()})`; // 每次运行唯一,避免历史数据干扰断言
  const cm = await api("/api/comment", "POST", { contentId: 1, body: remark }, userCookie);
  check("登录用户评论提交(进入待审)", cm.status === 200 && cm.data?.data?.pending === true);

  const before = await api("/api/comment?contentId=1");
  check("审核前:前台不可见(红线)", !(before.data?.data ?? []).some((c) => c.body.includes(remark)));

  // 后台审核通过
  const pending = await api("/api/admin/ugc/comments?status=PENDING", "GET", null, adminCookie);
  const cid = pending.data?.data?.items?.[0]?.id;
  check("后台待审列表有该评论", !!cid);
  if (cid) {
    await api("/api/admin/ugc/comments", "POST", { id: cid, status: "APPROVED" }, adminCookie);
    const after = await api("/api/comment?contentId=1");
    check("审核后:前台可见", (after.data?.data ?? []).some((c) => c.body.includes(remark)));
  }

  // 敏感词拦截
  await api("/api/admin/ugc/words", "POST", { words: ["验收违禁词"] }, adminCookie);
  const bad = await api("/api/comment", "POST", { contentId: 1, body: "包含验收违禁词的评论" }, userCookie);
  check("敏感词评论被拒", bad.status === 400 && (bad.data?.message ?? "").includes("敏感词"));
}

// 3. 表单提交 + 防重复
{
  // 服务端校验类断言共享 3 次/分/IP 的产品限频窗口:先等窗口清空(上轮验收的提交也算数),
  // 再把校验类放前、成功类随后,重复提交校验等窗口重置后单独验证
  await new Promise((r) => setTimeout(r, 61_000));
  const s1 = await api("/api/form/contact-form", "POST", { data: { f_phone: "13900139000" } });
  check("必填校验(服务端)", s1.status === 400 && (s1.data?.message ?? "").includes("必填"));
  const s2 = await api("/api/form/contact-form", "POST", { data: { f_name: "李验收", f_phone: "123", f_msg: "" } });
  check("手机号格式校验(服务端)", s2.status === 400 && (s2.data?.message ?? "").includes("手机号"));
  const payload = { data: { f_name: "张验收", f_phone: "13800138000", f_need: "产品咨询", f_msg: `请尽快联系我 ${Date.now()}` } };
  const s3 = await api("/api/form/contact-form", "POST", payload);
  if (s3.status !== 200) console.log("  [诊断] s3 响应:", JSON.stringify(s3.data));
  check("表单提交成功", s3.status === 200);
  // 重复提交校验需等限频窗口(60s)重置,否则会被 429 限频先拦下
  await new Promise((r) => setTimeout(r, 61_000));
  const s4 = await api("/api/form/contact-form", "POST", payload);
  check("相同内容重复提交被拒", s4.status === 400 && (s4.data?.message ?? "").includes("重复"));
}

// 4. 维护模式即时性
{
  // finally 兜底还原:此前若中途断言抛错,站点会滞留在维护模式
  try {
    await api("/api/admin/settings/brand", "PUT", { values: { maintenance: true } }, adminCookie);
    const flagsOn = await api("/api/flags");
    check("开维护:中间件开关立即生效", flagsOn.data?.maintenance === true);
    const m = await html("/zh-CN");
    check("开维护:前台显示维护页", m.text.includes("维护"));
    const adm = await fetch(base + "/zh-CN/admin/login");
    check("维护中后台仍可访问", adm.status === 200);
  } finally {
    await api("/api/admin/settings/brand", "PUT", { values: { maintenance: false } }, adminCookie);
  }
  const flagsOff = await api("/api/flags");
  check("关维护:中间件开关立即恢复", flagsOff.data?.maintenance === false);
  const m2 = await html("/zh-CN");
  check("关维护:首页恢复正常内容", m2.text.includes("最新动态"));
}

// 5. 点赞 + 阅读量
{
  const like1 = await fetch(base + "/api/interaction/like", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentId: 1 }),
  });
  const d1 = await like1.json();
  const guestCookie = like1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  check("游客点赞成功", d1?.data?.liked === true && d1?.data?.likeCount >= 1);
  const like2 = await api("/api/interaction/like", "POST", { contentId: 1 }, guestCookie);
  check("同游客再点=取消(切换)", like2.data?.data?.liked === false);
  const v = await api("/api/interaction/view", "POST", { contentId: 1 });
  check("阅读量上报", v.status === 200);
}

console.log(`\n===== 验收结果:${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
