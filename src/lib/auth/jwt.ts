import { SignJWT, jwtVerify } from "jose";

/**
 * 轻量 JWT 签发/验证(自研认证核心)。
 * 载荷约定:{ sub: 用户ID, typ: 'admin' | 'user', name: 显示名 }
 */

export interface SessionPayload {
  sub: string; // 用户 ID(字符串形式)
  typ: "admin" | "user";
  name: string;
}

function getSecret(): Uint8Array {
  // 开发环境允许缺省(方便首次体验);生产环境绝不允许——
  // 回退到公开的默认串等于任何人可离线伪造 admin JWT 接管后台,必须直接失败(fail-closed)
  const dev = process.env.NODE_ENV !== "production";
  const s = process.env.AUTH_SECRET || (dev ? "dev-insecure-secret-change-me" : "");
  if (!s) throw new Error("AUTH_SECRET 未配置:生产环境必须提供强随机密钥");
  return new TextEncoder().encode(s);
}

/** 是否仍在使用默认密钥(生产应告警并拒绝发令牌) */
export function isInsecureSecret(): boolean {
  const s = process.env.AUTH_SECRET || "";
  return !s || s.includes("please-change-me") || s === "dev-insecure-secret-change-me";
}

/** 签发 JWT;expiresIn 形如 '7d' | '30d' */
export async function signToken(payload: SessionPayload, expiresIn: string): Promise<string> {
  return new SignJWT({ typ: payload.typ, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

/** 验证 JWT,无效返回 null */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || (payload.typ !== "admin" && payload.typ !== "user")) return null;
    return { sub: String(payload.sub), typ: payload.typ, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
