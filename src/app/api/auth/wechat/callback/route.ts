import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWechatConfig } from "@/lib/config";
import { loginByWechat } from "@/server/user";
import { signToken } from "@/lib/auth/jwt";
import { USER_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

/**
 * 微信扫码登录回调:GET /api/auth/wechat/callback?code=&state=
 * 流程:校验 state → code 换 access_token/openid → 拉取昵称 → 登录/建号 → 种会话 cookie。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const c = await cookies();
  const expectedState = c.get("wx_state")?.value;
  const next = c.get("wx_next")?.value || "/";
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  const fail = (msg: string) =>
    NextResponse.redirect(`${base}${next.startsWith("/") ? next : "/"}?wxerror=${encodeURIComponent(msg)}`);

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail("微信登录校验失败,请重试");
  }

  const wechat = await getWechatConfig();
  if (!wechat.enabled || !wechat.appId || !wechat.appSecret) return fail("微信登录未启用");

  try {
    // 1) code 换 token + openid
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${wechat.appId}` +
        `&secret=${wechat.appSecret}&code=${code}&grant_type=authorization_code`,
      { cache: "no-store" }
    );
    const token = (await tokenRes.json()) as {
      access_token?: string;
      openid?: string;
      unionid?: string;
      errmsg?: string;
    };
    if (!token.access_token || !token.openid) return fail(token.errmsg || "微信授权失败");

    // 2) 拉取用户昵称(容错:失败也可登录)
    let nickname: string | null = null;
    try {
      const infoRes = await fetch(
        `https://api.weixin.qq.com/sns/userinfo?access_token=${token.access_token}&openid=${token.openid}`,
        { cache: "no-store" }
      );
      const info = (await infoRes.json()) as { nickname?: string };
      nickname = info.nickname ?? null;
    } catch {
      /* 忽略 */
    }

    // 3) 登录或创建用户
    const user = await loginByWechat({
      openId: token.openid,
      unionId: token.unionid ?? null,
      nickname,
    });

    const jwt = await signToken(
      { sub: String(user.id), typ: "user", name: user.nickname || "微信用户" },
      "30d"
    );
    const res = NextResponse.redirect(`${base}${next.startsWith("/") ? next : "/"}`);
    res.cookies.set(USER_COOKIE, jwt, sessionCookieOptions(30 * 24 * 3600));
    res.cookies.set("wx_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("wx_next", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "微信登录失败");
  }
}
