import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * API 统一响应与请求体校验工具。
 * 约定:所有接口返回 { ok: boolean, data?, message? } 结构。
 */

/** 成功响应 */
export function jsonOk<T>(data?: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data: data ?? null }, init);
}

/** 失败响应 */
export function jsonErr(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 解析并校验 JSON 请求体;失败时直接返回可用的错误响应 */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: jsonErr("请求体不是合法 JSON") };
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    return { error: jsonErr(`参数错误:${first?.path?.join(".") ?? ""} ${first?.message ?? ""}`.trim()) };
  }
  return { data: r.data };
}

/**
 * 客户端 IP 提取:从 XFF 链右端按可信反代层数回退。
 * 每个可信反代会把"它看到的来源"追加到链尾,因此真实客户端位于「右数第 N 层」位置
 * (N = 前置可信反代层数,默认 1)。旧实现取最左侧一段,攻击者在请求里自带 XFF 即可
 * 整段伪造,架空所有限频;取右侧可保证穿过反代后必然落在反代追加的那一跳。
 * 注意:不经反代直接暴露源站时,XFF 本身就是客户端可控的,任何解析策略都无法还原
 * 真实来源——此类部署应套一层反代(docs/部署说明.md 的 Caddy 方案)。
 */
const PRIVATE_IPV4 =
  /^(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|::1$|^fc|^fd|^fe80)/i;

export function getClientIp(req: Request): string {
  const h = req.headers;
  const hopsRaw = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  const hops = Number.isFinite(hopsRaw) && hopsRaw >= 1 ? hopsRaw : 1;

  // 过滤私网/环回跳点(容器的内部网络地址无追踪价值,也可能被请求方自伪造)
  const entries = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !PRIVATE_IPV4.test(s));

  if (entries.length > 0) {
    // 每个可信反代恰好追加一个来源条目,因此真实客户端位于右起第 hops 个
    const ip = entries[Math.max(0, entries.length - hops)];
    if (/^[0-9a-fA-F.:]{3,45}$/.test(ip)) return ip;
    return entries[entries.length - 1];
  }

  return h.get("x-real-ip")?.trim() || "unknown";
}
