import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getWechatConfig } from "@/lib/config";

/**
 * 微信 PC 扫码登录发起:GET /api/auth/wechat/login?next=/zh-CN
 * 跳转微信开放平台 qrconnect;state 随机串写 cookie 防 CSRF。
 * 未配置/未启用时 404(前台入口也会隐藏)。
 */
export async function GET(req: Request) {
  const wechat = await getWechatConfig();
  if (!wechat.enabled || !wechat.appId || !wechat.appSecret) {
    return NextResponse.json({ ok: false, message: "微信登录未启用" }, { status: 404 });
  }

  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/";
  const state = crypto.randomUUID().replace(/-/g, "");
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const redirectUri = encodeURIComponent(`${base}/api/auth/wechat/callback`);

  const target =
    `https://open.weixin.qq.com/connect/qrconnect?appid=${wechat.appId}` +
    `&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;

  const res = NextResponse.redirect(target);
  // state + 回跳地址(10 分钟有效)
  res.cookies.set("wx_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  res.cookies.set("wx_next", next, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
